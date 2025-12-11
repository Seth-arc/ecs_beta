// tests/move-transition.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Move Transition Logic', () => {

    test.beforeEach(async ({ page }) => {
        // Capture browser console logs
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

        // Setup mock session to bypass role login
        await page.addInitScript(() => {
            window.sessionStorage.setItem('esg_role', 'blue_facilitator');
            window.sessionStorage.setItem('esg_session_id', 'test-session-id');
            // Ensure we start fresh
            window.localStorage.clear();
            // Initialize game state to Move 1
            window.localStorage.setItem('sharedGameState', JSON.stringify({ move: 1, phase: 1 }));

            // Shim utils if missing (essential for facilitator.js)
            if (!window.safeGetItem) {
                window.safeGetItem = (key, fallback) => {
                    try {
                        const val = window.localStorage.getItem(key);
                        return val ? JSON.parse(val) : fallback;
                    } catch (e) { return fallback; }
                };
            }
            if (!window.safeSetItem) {
                window.safeSetItem = (key, val) => {
                    try {
                        window.localStorage.setItem(key, JSON.stringify(val));
                        return true;
                    } catch (e) { return false; }
                };
            }
        });

        await page.goto('/teams/blue/blue_facilitator.html');
        // Wait for page to be ready and overlay to be gone
        await page.waitForSelector('.header-title h1', { state: 'visible' });
        await page.waitForSelector('#roleLoginOverlay', { state: 'hidden' });

        // MOCK window.esg to handle actions locally (since no backend)
        await page.evaluate(() => {
            if (!window.esg) window.esg = {};

            // Mock submitAction to save to localStorage
            window.esg.submitAction = async (data) => {
                console.log('Mock submitAction:', data);
                // We'll trust localStorage 'sharedGameState' for move
                const state = JSON.parse(localStorage.getItem('sharedGameState') || '{"move":1}');
                const currentMove = state.move;

                // Use the key format expected by loadDataLegacy/Mock fetchActions
                const key = `actions_move_${currentMove}`;
                const existing = JSON.parse(localStorage.getItem(key) || '{"actions":[]}');
                const actions = existing.actions || [];

                // Add fields expected by facilitator display
                const newAction = {
                    ...data,
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    number: actions.length + 1,
                    status: 'draft'
                };

                actions.push(newAction);
                localStorage.setItem(key, JSON.stringify({ actions: actions }));
                return true;
            };

            // Mock fetchActions to read from localStorage
            window.esg.fetchActions = async (move) => {
                console.log('Mock fetchActions:', move);
                const key = `actions_move_${move}`;
                const raw = localStorage.getItem(key);
                if (!raw) return [];
                const data = JSON.parse(raw);
                return data.actions || [];
            };

            // Mock fetchGameState
            window.esg.fetchGameState = async () => {
                return JSON.parse(localStorage.getItem('sharedGameState') || '{"move":1,"phase":1}');
            };

            // Mock other requirements
            window.esg.fetchRequests = async () => [];
            window.esg.fetchCommunications = async () => [];
            window.esg.getClientId = () => 'test-client';
            window.esg.showToast = (msg) => console.log('Toast:', msg);
        });
    });

    test('Validates data preservation and isolation across move transitions', async ({ page }) => {
        // ==========================================
        // MOVE 1
        // ==========================================
        console.log('Testing Move 1...');

        // Navigate to "Actions" tab (default is Info Requests)
        await page.click('.nav-item[data-section="actions"]');
        await expect(page.locator('#actions')).toBeVisible();

        // 2. Add an Action in Move 1
        await page.selectOption('#actionMechanism', 'sanctions'); // Sanctions
        await page.selectOption('#actionSector', 'biotechnology');

        // Click a target (e.g., PRC)
        await page.click('button[data-target="prc"]');

        await page.selectOption('#actionExposure', 'technologies');

        await page.fill('#actionGoal', 'Goal for Move 1');
        await page.fill('#actionOutcomes', 'Outcomes for Move 1');
        await page.fill('#actionContingencies', 'Contingencies for Move 1');

        await page.click('text=Add Action');

        // 3. Verify Action appears in UI
        await expect(page.locator('#currentActions')).toContainText('Goal for Move 1');

        // 4. Verify Data is saved to Storage (Move 1)
        const move1Data = await page.evaluate(() => {
            const key = 'actions_move_1';
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        });

        expect(move1Data).not.toBeNull();
        expect(move1Data.actions.length).toBe(1);
        expect(move1Data.actions[0].goal_text || move1Data.actions[0].goal).toBe('Goal for Move 1');

        // ==========================================
        // TRANSITION TO MOVE 2
        // ==========================================
        console.log('Transitioning to Move 2...');

        await page.evaluate(() => {
            localStorage.setItem('sharedGameState', JSON.stringify({ move: 2, phase: 1 }));
            // Force update immediately using global alias
            if (window.loadDataFromDatabase) {
                window.loadDataFromDatabase();
            }
        });

        // Wait for update
        await page.waitForTimeout(2000);

        // Debug: Check currentMove inside browser
        const currentMoveVal = await page.evaluate(() => window.currentMove);
        console.log('Browser Current Move:', currentMoveVal);

        // 5. Verify UI updates to Move 2 (If implemented in UI)
        const epochText = await page.locator('#moveEpoch').textContent();
        console.log('Epoch Text:', epochText);

        // 6. Verify "Active" Actions list is Clean (Clean Slate)
        await expect(page.locator('#currentActions')).toContainText('No actions recorded'); // Empty state text
        await expect(page.locator('#currentActions')).not.toContainText('Goal for Move 1');

        // 7. Add an Action in Move 2
        await page.selectOption('#actionMechanism', 'export');
        await page.selectOption('#actionSector', 'agriculture');
        await page.click('button[data-target="rus"]');
        await page.selectOption('#actionExposure', 'supply-chain');

        await page.fill('#actionGoal', 'Goal for Move 2');
        await page.fill('#actionOutcomes', 'Outcomes for Move 2');
        await page.fill('#actionContingencies', 'Contingencies for Move 2');

        await page.click('text=Add Action');

        // 8. Verify Action 2 appears
        await expect(page.locator('#currentActions')).toContainText('Goal for Move 2');

        // 9. Verify Move 1 Data is STILL accessible in storage
        const move1DataCheck = await page.evaluate(() => {
            const key = 'actions_move_1';
            return JSON.parse(localStorage.getItem(key));
        });
        expect(move1DataCheck.actions.length).toBe(1);
        expect(move1DataCheck.actions[0].goal).toBe('Goal for Move 1');

        // 10. Verify Move 2 Data is saved
        const move2Data = await page.evaluate(() => {
            const key = 'actions_move_2';
            return JSON.parse(localStorage.getItem(key));
        });
        expect(move2Data.actions.length).toBe(1);
        expect(move2Data.actions[0].goal).toBe('Goal for Move 2');

        // ==========================================
        // TRANSITION TO MOVE 3
        // ==========================================
        console.log('Transitioning to Move 3...');

        await page.evaluate(() => {
            localStorage.setItem('sharedGameState', JSON.stringify({ move: 3, phase: 1 }));
            // Force update immediately
            if (window.loadDataFromDatabase) {
                window.loadDataFromDatabase();
            }
        });
        await page.waitForTimeout(2000);

        // 12. Verify Clean Slate again
        await expect(page.locator('#currentActions')).toContainText('No actions recorded');

        // 13. Verify Timeline Logic 
        const allMovesKeys = await page.evaluate(() => {
            return {
                m1: localStorage.getItem('actions_move_1'),
                m2: localStorage.getItem('actions_move_2')
            };
        });

        expect(allMovesKeys.m1).toBeTruthy();
        expect(allMovesKeys.m2).toBeTruthy();
    });
});
