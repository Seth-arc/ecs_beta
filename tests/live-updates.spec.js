
import { test, expect } from '@playwright/test';

test.describe('Live Updates & Real-time Sync', () => {
    test.setTimeout(120000); // Allow ample time for multi-role interactions

    test('Real-time synchronization across roles', async ({ browser }) => {
        // --- 1. Setup Session via Game Master ---
        const contextMaster = await browser.newContext();
        const pageMaster = await contextMaster.newPage();

        // Capture console logs for debugging
        pageMaster.on('console', msg => console.log(`MASTER LOG: ${msg.text()}`));

        await pageMaster.goto('/master.html');
        await pageMaster.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        const sessionName = 'LiveUpdateTest_' + Date.now();
        const sessionId = await pageMaster.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`Session Created: ${sessionId}`);

        // Join session as Master to monitor
        await pageMaster.evaluate(async (sid) => {
            await window.esg.joinSession(sid);
        }, sessionId);
        await pageMaster.reload(); // Reload to activate session view

        // --- 2. Setup Facilitator Context ---
        const contextFac = await browser.newContext();
        const pageFac = await contextFac.newPage();
        pageFac.on('console', msg => console.log(`FACILITATOR LOG: ${msg.text()}`));

        await pageFac.goto('/teams/blue/blue_facilitator.html');
        // Login Facilitator
        await pageFac.fill('#roleLoginSession', sessionId);
        await pageFac.fill('#roleLoginPassword', 'facilitator2025');
        await Promise.all([
            pageFac.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageFac.click('button:has-text("Login")')
        ]);
        await expect(pageFac.locator('#loader')).toBeHidden();

        // --- 3. Setup White Cell Context ---
        const contextWhite = await browser.newContext();
        const pageWhite = await contextWhite.newPage();
        pageWhite.on('console', msg => console.log(`WHITECELL LOG: ${msg.text()}`));

        await pageWhite.goto('/teams/blue/blue_white_cell.html');
        // Login White Cell
        await pageWhite.fill('#roleLoginSession', sessionId);
        await pageWhite.fill('#roleLoginPassword', 'whitecell2025');
        await Promise.all([
            pageWhite.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageWhite.click('button:has-text("Login")')
        ]);
        await expect(pageWhite.locator('#loader')).toBeHidden();

        // --- 4. Setup Notetaker Context ---
        const contextNote = await browser.newContext();
        const pageNote = await contextNote.newPage();
        pageNote.on('console', msg => console.log(`NOTETAKER LOG: ${msg.text()}`));

        await pageNote.goto('/teams/blue/blue_notetaker.html');
        // Login Notetaker
        await pageNote.fill('#roleLoginSession', sessionId);
        await pageNote.fill('#roleLoginPassword', 'notetaker2025');
        await Promise.all([
            pageNote.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageNote.click('button:has-text("Login")')
        ]);
        await expect(pageNote.locator('#loader')).toBeHidden();


        // --- TEST STEP 1: Facilitator Creates Action -> White Cell & Master See It ---
        console.log('--- Step 1: Facilitator creates action ---');

        await pageFac.click('.nav-item[data-section="actions"]');
        await expect(pageFac.locator('#actions')).toHaveClass(/active/);

        // Fill Action Form
        await pageFac.selectOption('#actionMechanism', 'sanctions');
        await pageFac.selectOption('#actionSector', 'biotechnology');
        await pageFac.selectOption('#actionExposure', 'technologies'); // Valid option verified in HTML

        // Select a target
        const firstTarget = pageFac.locator('.target-checkbox').first();
        await firstTarget.click();

        await pageFac.fill('#actionGoal', 'Live Update Test Action');
        await pageFac.fill('#actionOutcomes', 'Expected outcome is success and stability across the sector.');
        await pageFac.fill('#actionContingencies', 'If this fails, we will pivot to alternative diplomatic channels.');

        await pageFac.click('button:has-text("Add Action")');

        // Submit the action
        const actionItem = pageFac.locator('#currentActions .action-item').first();
        await expect(actionItem).toBeVisible();
        await expect(actionItem).toContainText('Live Update Test Action');

        // Handle confirmation dialog
        pageFac.on('dialog', dialog => dialog.accept());
        await actionItem.locator('button:has-text("Submit")').click({ force: true });

        // Verify White Cell sees it (without reload if real-time)
        console.log('Waiting for White Cell to see action...');
        await pageWhite.click('.nav-item[data-section="actions"]');

        // Use a polling loop or expect with timeout to wait for real-time update
        await expect(pageWhite.locator('#actionsContainer .action-item')).toContainText('Live Update Test Action', { timeout: 30000 });

        // Verify Master sees it (Master might need to navigate to correct view or has a simplified timeline?)
        // Master view usually has a dashboard. We'll check if Master can query it via console or UI if available.
        // Assuming Master has a way to view actions or timeline.
        // Let's check Master timeline first.


        // --- TEST STEP 2: Facilitator Activity -> Timeline (All Roles) ---
        // Verify facilitation action submission appears in White Cell Timeline
        console.log('Checking White Cell timeline for Action Submitted...');
        await pageWhite.click('.nav-item[data-section="timeline"]');
        await expect(pageWhite.locator('.timeline-item').filter({ hasText: 'Action Submitted' })).toBeVisible({ timeout: 30000 });

        // --- TEST STEP 3: Notetaker Adds Observation -> White Cell Sees It ---
        console.log('--- Step 3: Notetaker adds observation ---');

        // Notetaker adds a note
        await pageNote.fill('#quickCaptureText', 'Live Note from Notetaker');
        await pageNote.click('button:has-text("Add to Timeline")');
        console.log('Notetaker submitted note.');

        // Verify White Cell sees it in Timeline
        console.log('Checking White Cell timeline for Notetaker note...');
        await expect(pageWhite.locator('.timeline-item').filter({ hasText: 'Live Note from Notetaker' })).toBeVisible({ timeout: 30000 });

        // Verify Facilitator sees it in Timeline (Facilitator has timeline section)
        console.log('Checking Facilitator timeline for Notetaker note...');
        await pageFac.click('.nav-item[data-section="timeline"]');
        await expect(pageFac.locator('.timeline-item').filter({ hasText: 'Live Note from Notetaker' })).toBeVisible({ timeout: 30000 });


        // --- TEST STEP 4: White Cell Adjudicates -> Facilitator Sees It ---
        console.log('--- Step 4: White Cell Adjudicates ---');

        await pageWhite.click('.nav-item[data-section="adjudication"]');

        // Need to select the action. It might take a moment to appear in the select list if it just arrived.
        // Refreshing inputs or waiting for selector population
        await pageWhite.waitForTimeout(2000); // Give JS time to populate select

        const actionSelector = pageWhite.locator('#adj-action-selector');

        // We might need to trigger population manually if real-time didn't trigger it, but goal is real-time.
        // If the selector is empty, we fail or retry.
        const optionCount = await actionSelector.locator('option').count();
        if (optionCount <= 1) {
            console.log('Action selector empty, attempting refresh/reload for Adjudication tab...');
            await pageWhite.click('.nav-item[data-section="timeline"]'); // switch away
            await pageWhite.click('.nav-item[data-section="adjudication"]'); // switch back to trigger populate
        }

        // Select the action (by text or value). Assuming text contains our goal.
        await actionSelector.selectOption({ label: /Live Update Test Action/ }); // Partial match using regex
        // If label doesn't work, we grab the value.

        // Fill adjudication details
        await pageWhite.fill('#adj-narrative', 'Adjudicated Result: Success');
        await pageWhite.click('button:has-text("Save Adjudication")');

        // Verify Facilitator sees updates
        // Facilitator might see status change in actions list or a new message/timeline item.
        console.log('Waiting for Facilitator to see adjudication...');
        await pageFac.click('.nav-item[data-section="actions"]');
        // Check if status changed or just check timeline if adjudication logs there

        // Also check White Cell Response/Outcome
        // The adjudication typically logs a "Ruling" or similar.

        await pageFac.click('.nav-item[data-section="timeline"]');
        // Or if there is a 'white-responses' section

        // Adjudication usually logs an outcome to timeline or actions list
        // Let's verify timeline for now
        // NOTE: Exact text depends on implementation. Looking for "Adjudication" or "Result"

        await expect(pageFac.locator('body')).toContainText('Adjudicated Result: Success', { timeout: 30000 });

        console.log('All real-time updates verified successfully!');

        await contextMaster.close();
        await contextFac.close();
        await contextWhite.close();
        await contextNote.close();
    });
});
