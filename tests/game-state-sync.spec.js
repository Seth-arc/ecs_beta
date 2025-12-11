
import { test, expect } from '@playwright/test';

test.describe('Game State Sync: Cross-Role State Synchronization', () => {

    test.setTimeout(120000); // 2 minutes for real-time sync testing

    test('White Cell changes game state and other roles see updates', async ({ browser }) => {
        const context = await browser.newContext();

        // --- Setup Session ---
        const setupPage = await context.newPage();
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        const sessionName = 'Game State Sync Test ' + Date.now();
        console.log(`Creating session: ${sessionName}`);

        const sessionId = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`Session Created: ${sessionId}`);
        await setupPage.close();

        // --- Setup Multiple Roles ---
        console.log('\n=== Setting Up Multiple Roles ===');

        const pageWhiteCell = await context.newPage();
        pageWhiteCell.on('console', msg => console.log(`WHITECELL LOG: ${msg.text()}`));

        const pageFacilitator = await context.newPage();
        pageFacilitator.on('console', msg => console.log(`FACILITATOR LOG: ${msg.text()}`));

        const pageNotetaker = await context.newPage();
        pageNotetaker.on('console', msg => console.log(`NOTETAKER LOG: ${msg.text()}`));

        // White Cell login
        console.log('Step 1: White Cell Login');
        await pageWhiteCell.goto('/teams/blue/blue_white_cell.html');
        await expect(pageWhiteCell.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageWhiteCell.fill('#roleLoginSession', sessionId);
        await pageWhiteCell.fill('#roleLoginPassword', 'whitecell2025');

        await Promise.all([
            pageWhiteCell.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageWhiteCell.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageWhiteCell.locator('#loader')).toBeHidden({ timeout: 15000 });
        console.log('✓ White Cell logged in');

        // Facilitator login
        console.log('Step 2: Facilitator Login');
        await pageFacilitator.goto('/teams/blue/blue_facilitator.html');
        await expect(pageFacilitator.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageFacilitator.fill('#roleLoginSession', sessionId);
        await pageFacilitator.fill('#roleLoginPassword', 'facilitator2025');

        await Promise.all([
            pageFacilitator.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageFacilitator.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageFacilitator.locator('#loader')).toBeHidden({ timeout: 15000 });
        console.log('✓ Facilitator logged in');

        // Notetaker login
        console.log('Step 3: Notetaker Login');
        await pageNotetaker.goto('/teams/blue/blue_notetaker.html');
        await expect(pageNotetaker.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageNotetaker.fill('#roleLoginSession', sessionId);
        await pageNotetaker.fill('#roleLoginPassword', 'notetaker2025');

        await Promise.all([
            pageNotetaker.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageNotetaker.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageNotetaker.locator('#loader')).toBeHidden({ timeout: 15000 });
        console.log('✓ Notetaker logged in');

        // --- Test 1: Verify Initial Game State ---
        console.log('\n=== Test 1: Verify Initial Game State ===');

        const initialStates = await Promise.all([
            pageWhiteCell.evaluate(() => window.esg ? window.esg.fetchGameState() : null),
            pageFacilitator.evaluate(() => window.esg ? window.esg.fetchGameState() : null),
            pageNotetaker.evaluate(() => window.esg ? window.esg.fetchGameState() : null)
        ]);

        console.log('White Cell initial state:', initialStates[0]);
        console.log('Facilitator initial state:', initialStates[1]);
        console.log('Notetaker initial state:', initialStates[2]);

        // All should start at move 1, phase 1
        expect(initialStates[0]?.move).toBe(1);
        expect(initialStates[1]?.move).toBe(1);
        expect(initialStates[2]?.move).toBe(1);

        console.log('✅ Test 1 PASSED: All roles start with same game state (Move 1)');

        // --- Test 2: White Cell Changes Move ---
        console.log('\n=== Test 2: White Cell Changes Move to 2 ===');

        // White Cell changes move to 2
        await pageWhiteCell.evaluate(() => {
            const moveSelector = document.getElementById('moveSelector');
            if (moveSelector) {
                moveSelector.value = '2';
                // Trigger change event
                moveSelector.dispatchEvent(new Event('change'));
                // Call the change handler if it exists
                if (window.changeMoveContext) {
                    window.changeMoveContext();
                }
            }
        });

        await pageWhiteCell.waitForTimeout(2000);

        // Verify White Cell sees move 2
        const whiteCellMove = await pageWhiteCell.evaluate(() => {
            return window.esg ? window.esg.fetchGameState().then(s => s.move) : null;
        });

        console.log('White Cell current move:', whiteCellMove);
        expect(whiteCellMove).toBe(2);
        console.log('✓ White Cell successfully changed to Move 2');

        // --- Test 3: Verify Other Roles See Move Change ---
        console.log('\n=== Test 3: Verify Other Roles See Move Change ===');

        // Give time for real-time sync
        await pageFacilitator.waitForTimeout(3000);
        await pageNotetaker.waitForTimeout(3000);

        // Reload pages to ensure they fetch latest state
        await pageFacilitator.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageFacilitator.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageNotetaker.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageNotetaker.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Check if other roles see move 2
        const facilitatorMove = await pageFacilitator.evaluate(() => {
            return window.esg ? window.esg.fetchGameState().then(s => s.move) : null;
        });

        const notetakerMove = await pageNotetaker.evaluate(() => {
            return window.esg ? window.esg.fetchGameState().then(s => s.move) : null;
        });

        console.log('Facilitator sees move:', facilitatorMove);
        console.log('Notetaker sees move:', notetakerMove);

        expect(facilitatorMove).toBe(2);
        expect(notetakerMove).toBe(2);

        console.log('✅ Test 3 PASSED: All roles synchronized to Move 2');

        // --- Test 4: White Cell Changes Phase ---
        console.log('\n=== Test 4: White Cell Changes Phase ===');

        // White Cell changes phase to 2 (Alliance Consultation)
        await pageWhiteCell.evaluate(() => {
            const phaseBtn = document.querySelector('.phase-btn[data-phase="2"]');
            if (phaseBtn) {
                phaseBtn.click();
            }
        });

        await pageWhiteCell.waitForTimeout(2000);

        // Verify White Cell sees phase 2
        const whiteCellPhase = await pageWhiteCell.evaluate(() => {
            return window.esg ? window.esg.fetchGameState().then(s => s.phase) : null;
        });

        console.log('White Cell current phase:', whiteCellPhase);
        expect(whiteCellPhase).toBe(2);
        console.log('✓ White Cell successfully changed to Phase 2');

        // --- Test 5: Verify Phase Sync Across Roles ---
        console.log('\n=== Test 5: Verify Phase Synchronization ===');

        // Give time for real-time sync
        await pageFacilitator.waitForTimeout(3000);
        await pageNotetaker.waitForTimeout(3000);

        // Reload to get latest state
        await pageFacilitator.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageFacilitator.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageNotetaker.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageNotetaker.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Check if other roles see phase 2
        const facilitatorPhase = await pageFacilitator.evaluate(() => {
            return window.esg ? window.esg.fetchGameState().then(s => s.phase) : null;
        });

        const notetakerPhase = await pageNotetaker.evaluate(() => {
            return window.esg ? window.esg.fetchGameState().then(s => s.phase) : null;
        });

        console.log('Facilitator sees phase:', facilitatorPhase);
        console.log('Notetaker sees phase:', notetakerPhase);

        expect(facilitatorPhase).toBe(2);
        expect(notetakerPhase).toBe(2);

        console.log('✅ Test 5 PASSED: All roles synchronized to Phase 2');

        // --- Test 6: Verify Complete State Consistency ---
        console.log('\n=== Test 6: Verify Complete State Consistency ===');

        const finalStates = await Promise.all([
            pageWhiteCell.evaluate(() => window.esg.fetchGameState()),
            pageFacilitator.evaluate(() => window.esg.fetchGameState()),
            pageNotetaker.evaluate(() => window.esg.fetchGameState())
        ]);

        console.log('Final White Cell state:', finalStates[0]);
        console.log('Final Facilitator state:', finalStates[1]);
        console.log('Final Notetaker state:', finalStates[2]);

        // All should be at move 2, phase 2
        expect(finalStates[0]?.move).toBe(2);
        expect(finalStates[0]?.phase).toBe(2);
        expect(finalStates[1]?.move).toBe(2);
        expect(finalStates[1]?.phase).toBe(2);
        expect(finalStates[2]?.move).toBe(2);
        expect(finalStates[2]?.phase).toBe(2);

        console.log('✅ Test 6 PASSED: Complete state consistency verified');

        console.log('\n✅ SUCCESS: Game State Synchronization test completed!');
        console.log('Summary:');
        console.log('  - Initial state synchronized across all roles ✓');
        console.log('  - White Cell can change move ✓');
        console.log('  - Move changes propagate to other roles ✓');
        console.log('  - White Cell can change phase ✓');
        console.log('  - Phase changes propagate to other roles ✓');
        console.log('  - Complete state consistency maintained ✓');

        await context.close();
    });
});
