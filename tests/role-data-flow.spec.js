
import { test, expect } from '@playwright/test';

test.describe('Role Data Flow: Facilitator to White Cell', () => {

    test.setTimeout(90000);

    test('Facilitator can submit action and White Cell can see it', async ({ browser }) => {
        const context = await browser.newContext();

        // --- Setup Session ---
        const setupPage = await context.newPage();

        // Capture console logs
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        const sessionName = 'Flow Test ' + Date.now();
        console.log(`Creating session: ${sessionName}`);

        const sessionId = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`Session Created: ${sessionId}`);
        await setupPage.close();

        // --- 1. Facilitator Flow ---
        const pageFac = await context.newPage();

        // Capture console logs
        pageFac.on('console', msg => console.log(`FACILITATOR LOG: ${msg.text()}`));

        console.log('Step 1: Facilitator Login');
        await pageFac.goto('/teams/blue/blue_facilitator.html');

        await expect(pageFac.locator('#loader')).toBeHidden({ timeout: 15000 });

        const loginOverlay = pageFac.locator('#roleLoginOverlay');
        await expect(loginOverlay).toBeVisible();

        await pageFac.fill('#roleLoginSession', sessionId);
        await pageFac.fill('#roleLoginPassword', 'facilitator2025');

        console.log('Step 1.1: Clicking Login and waiting for reload');
        // Use domcontentloaded instead of networkidle to be less flaky on local server with potential hanging requests
        await Promise.all([
            pageFac.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageFac.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageFac.locator('#loader')).toBeHidden({ timeout: 15000 });
        await expect(loginOverlay).toBeHidden();

        console.log('Step 2: Create Action');
        await pageFac.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        await expect(pageFac.locator('#actions')).toHaveClass(/active/);

        console.log('Step 2.1: Filling Form via Evaluate');

        await pageFac.evaluate(() => {
            document.getElementById('actionMechanism').value = 'sanctions';
            document.getElementById('actionSector').value = 'biotechnology';
            document.getElementById('actionExposure').value = 'supply-chain';
            document.getElementById('actionGoal').value = 'Test Goal for Integration Flow';
            document.getElementById('actionOutcomes').value = 'Expected success and compliance';
            document.getElementById('actionContingencies').value = 'Fallback to secondary sanctions';

            // Toggle target manually if needed or via click
            const target = document.querySelector('button[data-target="prc"]');
            if (target) {
                target.classList.add('selected'); // Force select to be sure
            }
        });

        await expect(pageFac.locator('#actionGoal')).toHaveValue('Test Goal for Integration Flow');

        console.log('Step 2.2: Calling addAction() directly');
        await pageFac.evaluate(async () => {
            if (window.addAction) {
                console.log('Calling window.addAction()...');
                await window.addAction();
            } else {
                console.error('window.addAction is not defined');
            }
        });

        // Verify it appears in "Current Actions"
        const actionItem = pageFac.locator('#currentActions .action-item').first();
        // Wait longer and check if error toast appeared
        try {
            await expect(actionItem).toBeVisible({ timeout: 10000 });
            await expect(actionItem).toContainText('Test Goal for Integration Flow');
        } catch (e) {
            console.log('Action item not found. Checking for error messages...');
            const toast = pageFac.locator('#toast-container'); // Assuming toast container ID or similar
            if (await toast.isVisible()) {
                console.log('Toast visible:', await toast.innerText());
            }
            throw e;
        }

        console.log('Step 3: Submit Action');
        const submitBtn = actionItem.locator('button:has-text("Submit")');
        await expect(submitBtn).toBeVisible();

        pageFac.on('dialog', dialog => dialog.accept());
        await submitBtn.click({ force: true });

        await expect(submitBtn).toBeHidden({ timeout: 10000 });

        // --- 2. White Cell Flow ---
        const pageWhite = await context.newPage();

        pageWhite.on('console', msg => console.log(`WHITECELL LOG: ${msg.text()}`));

        console.log('Step 4: White Cell Login');
        await pageWhite.goto('/teams/blue/blue_white_cell.html');

        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageWhite.fill('#roleLoginSession', sessionId);
        await pageWhite.fill('#roleLoginPassword', 'whitecell2025');

        console.log('Step 4.1: White Cell Login Click');
        await Promise.all([
            pageWhite.waitForNavigation({ waitUntil: 'networkidle' }),
            pageWhite.click('button:has-text("Login")')
        ]);

        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });
        await expect(pageWhite.locator('#roleLoginOverlay')).toBeHidden();

        // Give time for data propagation from Facilitator submission
        await pageWhite.waitForTimeout(3000);

        console.log('Step 5: Verify Action Visibility (Reloading for freshness)');
        await pageWhite.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageWhite.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        await expect(pageWhite.locator('#actions')).toHaveClass(/active/);

        // Explicitly trigger data load (event listeners may not fire in test environment)
        await pageWhite.evaluate(async () => {
            if (window.loadSubmittedActions) {
                console.log('Explicitly calling loadSubmittedActions()');
                await window.loadSubmittedActions();
            }
        });

        // Give time for rendering
        await pageWhite.waitForTimeout(1000);

        const whiteActionItem = pageWhite.locator('#actionsContainer .action-item').filter({ hasText: 'Test Goal for Integration Flow' });
        await expect(whiteActionItem).toBeVisible({ timeout: 20000 });

        console.log('Success: Action flow verified from Facilitator to White Cell');

        await context.close();
    });
});
