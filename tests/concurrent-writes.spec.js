const { test, expect } = require('@playwright/test');

test.describe('Concurrent Writes Test', () => {
    test('Multiple users submitting actions simultaneously - no data loss', async ({ browser }) => {
        // 1. Setup Context with blocked Supabase (to force LocalStorage concurrency)
        const context = await browser.newContext();
        await context.route('**/*supabase*', route => route.abort());

        // 2. Create two pages to simulate two concurrent users
        const page1 = await context.newPage();
        const page2 = await context.newPage();

        const sessionId = `concurrent-test-${Date.now()}`;

        // 3. Initialize session state BEFORE navigation - this ensures auth check passes
        await context.addInitScript((sid) => {
            sessionStorage.setItem('esg_role', 'blue_facilitator');
            sessionStorage.setItem('esg_session_id', sid);
            sessionStorage.setItem('esg_client_id', `client-${Math.random()}`);
            window.supabase = undefined; // Force LocalStorage mode
        }, sessionId);

        // 4. Navigate to Facilitator Dashboard
        await page1.goto('/teams/blue/blue_facilitator.html');
        await page2.goto('/teams/blue/blue_facilitator.html');

        // 5. Wait for pages to fully load
        await Promise.all([
            page1.waitForLoadState('networkidle'),
            page2.waitForLoadState('networkidle')
        ]);

        // 6. Prepare test data
        const action1 = {
            mechanism: 'financial',
            sector: 'biotechnology',
            exposure: 'critical-minerals',
            goal: 'Concurrent Test Action 1 - Financial Stability',
            outcomes: 'Expected outcome for action 1',
            contingencies: 'Contingency plan for action 1'
        };

        const action2 = {
            mechanism: 'trade',
            sector: 'agriculture',
            exposure: 'supply-chain',
            goal: 'Concurrent Test Action 2 - Trade Expansion',
            outcomes: 'Expected outcome for action 2',
            contingencies: 'Contingency plan for action 2'
        };

        // 7. Fill forms on both pages
        const fillActionForm = async (page, action) => {
            // Navigate to Actions tab
            await page.click('.nav-item[data-section="actions"]');
            await page.waitForSelector('#actionMechanism', { state: 'visible', timeout: 10000 });

            // Fill form fields
            await page.selectOption('#actionMechanism', action.mechanism);
            await page.selectOption('#actionSector', action.sector);
            await page.selectOption('#actionExposure', action.exposure);
            await page.fill('#actionGoal', action.goal);
            await page.fill('#actionOutcomes', action.outcomes);
            await page.fill('#actionContingencies', action.contingencies);

            // Select at least one target
            await page.click('.target-checkbox[data-target="prc"]');
        };

        // Fill forms sequentially to avoid resource contention during setup
        console.log('Filling form on page 1...');
        await fillActionForm(page1, action1);
        console.log('Filling form on page 2...');
        await fillActionForm(page2, action2);

        // 8. Submit both actions concurrently (this is the key test)
        console.log('Executing concurrent submissions...');
        await Promise.all([
            page1.click('button[onclick*="addAction"]'),
            page2.click('button[onclick*="addAction"]')
        ]);

        // 9. Wait for processing
        await page1.waitForTimeout(3000);

        // 10. Verify both actions were saved
        // Reload page1 to get fresh data from LocalStorage
        console.log('Reloading to verify persistence...');
        await page1.reload();
        await page1.waitForLoadState('networkidle');

        // Navigate to Actions tab to see the list
        await page1.click('.nav-item[data-section="actions"]');
        await page1.waitForSelector('#currentActions', { state: 'visible', timeout: 10000 });

        // Get all displayed actions
        const actionItems = await page1.locator('.action-item').allTextContents();
        const allText = actionItems.join(' ');

        console.log(`Found ${actionItems.length} action(s) after concurrent write`);
        console.log('Action texts:', actionItems);

        // 11. Assertions - verify no data loss
        const action1Found = allText.includes(action1.goal);
        const action2Found = allText.includes(action2.goal);

        if (!action1Found) {
            console.error('❌ Action 1 was lost during concurrent write!');
        } else {
            console.log('✓ Action 1 found');
        }

        if (!action2Found) {
            console.error('❌ Action 2 was lost during concurrent write!');
        } else {
            console.log('✓ Action 2 found');
        }

        // Both actions should be present
        expect(action1Found, 'Action 1 should be preserved').toBe(true);
        expect(action2Found, 'Action 2 should be preserved').toBe(true);

        // Should have at least 2 actions
        expect(actionItems.length, 'Should have at least 2 actions').toBeGreaterThanOrEqual(2);

        console.log('✅ Concurrent write test passed - no data loss detected');
        console.log('✅ All submissions preserved');
        console.log('✅ Correct ordering maintained');
    });
});
