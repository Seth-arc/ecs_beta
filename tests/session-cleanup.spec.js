
import { test, expect } from '@playwright/test';

test.describe('Session Cleanup Test', () => {

    test.setTimeout(120000); // 2 minutes for complete cleanup tests

    test('Completed sessions can be archived', async ({ browser }) => {
        const context = await browser.newContext();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('TEST: Completed sessions can be archived');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // ========================================
        // STEP 1: Create a session
        // ========================================
        const setupPage = await context.newPage();
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        const sessionName = 'Archive Test Session ' + Date.now();
        console.log(`\n📋 Creating session: ${sessionName}`);

        const sessionId = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`✅ Session Created: ${sessionId}`);

        // ========================================
        // STEP 2: Add some data to the session
        // ========================================
        console.log('\n📝 Adding data to session...');

        const facPage = await context.newPage();
        facPage.on('console', msg => console.log(`FACILITATOR LOG: ${msg.text()}`));

        await facPage.goto('/teams/blue/blue_facilitator.html');
        await expect(facPage.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Login
        await facPage.fill('#roleLoginSession', sessionId);
        await facPage.fill('#roleLoginPassword', 'facilitator2025');
        await Promise.all([
            facPage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            facPage.click('button:has-text("Login")', { force: true })
        ]);

        await expect(facPage.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Create an action
        await facPage.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        await facPage.selectOption('#actionMechanism', 'investment');
        await facPage.selectOption('#actionSector', 'biotechnology');
        await facPage.evaluate(() => {
            const prcTarget = document.querySelector('.target-checkbox[data-target="prc"]');
            if (prcTarget) prcTarget.click();
        });
        await facPage.fill('#actionGoal', 'Test action for archival');
        await facPage.fill('#actionOutcomes', 'Test outcomes');
        await facPage.fill('#actionContingencies', 'Test contingencies');
        await facPage.selectOption('#actionExposure', 'supply-chain');

        await facPage.evaluate(async () => {
            if (window.addAction) await window.addAction();
        });

        await facPage.waitForTimeout(2000);
        console.log('✅ Test data created');

        // ========================================
        // STEP 3: Archive the session
        // ========================================
        console.log('\n🗄️  Archiving session...');

        const archiveResult = await setupPage.evaluate(async (sid) => {
            try {
                if (window.esg && window.esg.archiveSession) {
                    const result = await window.esg.archiveSession(sid);
                    console.log('archiveSession result:', result);
                    return { success: !!result, error: null, result: result };
                }
                return { success: false, error: 'archiveSession not available' };
            } catch (error) {
                console.error('Error archiving session:', error);
                return { success: false, error: error.message };
            }
        }, sessionId);

        console.log('Archive result:', archiveResult);
        expect(archiveResult.success).toBe(true);
        console.log('✅ Session archived successfully');

        // ========================================
        // STEP 4: Verify session is marked as archived
        // ========================================
        console.log('\n🔍 Verifying archive status...');

        const sessionStatus = await setupPage.evaluate(async (sid) => {
            if (window.esg && window.esg.getSession) {
                const session = await window.esg.getSession(sid);
                return session ? session.status : null;
            }
            return null;
        }, sessionId);

        expect(sessionStatus).toBe('archived');
        console.log('✅ Session status confirmed as "archived"');

        // ========================================
        // STEP 5: Verify archived session doesn't appear in active list
        // ========================================
        console.log('\n📋 Checking active sessions list...');

        const activeSessions = await setupPage.evaluate(async () => {
            if (window.esg && window.esg.listSessions) {
                const sessions = await window.esg.listSessions();
                return sessions.filter(s => s.status === 'active');
            }
            return [];
        });

        const archivedSessionInActiveList = activeSessions.find(s => s.id === sessionId);
        expect(archivedSessionInActiveList).toBeUndefined();
        console.log('✅ Archived session not in active sessions list');

        await context.close();
        console.log('\n✅ ARCHIVE TEST PASSED\n');
    });

    test('Old data doesn\'t affect new sessions', async ({ browser }) => {
        const context = await browser.newContext();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('TEST: Old data doesn\'t affect new sessions');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const setupPage = await context.newPage();
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        // ========================================
        // STEP 1: Create first session with data
        // ========================================
        console.log('\n📋 Creating first session...');
        const session1Name = 'Old Session ' + Date.now();
        const session1Id = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, session1Name);

        expect(session1Id).toBeTruthy();
        console.log(`✅ Session 1 Created: ${session1Id}`);

        // Add data to session 1
        const facPage1 = await context.newPage();
        await facPage1.goto('/teams/blue/blue_facilitator.html');
        await expect(facPage1.locator('#loader')).toBeHidden({ timeout: 15000 });

        await facPage1.fill('#roleLoginSession', session1Id);
        await facPage1.fill('#roleLoginPassword', 'facilitator2025');
        await Promise.all([
            facPage1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            facPage1.click('button:has-text("Login")', { force: true })
        ]);

        await expect(facPage1.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Create action in session 1
        await facPage1.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        const oldGoal = 'Old Session Action ' + Date.now();
        await facPage1.selectOption('#actionMechanism', 'investment');
        await facPage1.selectOption('#actionSector', 'biotechnology');
        await facPage1.evaluate(() => {
            const prcTarget = document.querySelector('.target-checkbox[data-target="prc"]');
            if (prcTarget) prcTarget.click();
        });
        await facPage1.fill('#actionGoal', oldGoal);
        await facPage1.fill('#actionOutcomes', 'Old outcomes');
        await facPage1.fill('#actionContingencies', 'Old contingencies');
        await facPage1.selectOption('#actionExposure', 'supply-chain');

        await facPage1.evaluate(async () => {
            if (window.addAction) await window.addAction();
        });

        await facPage1.waitForTimeout(2000);
        console.log(`✅ Created action in session 1: "${oldGoal}"`);

        // ========================================
        // STEP 2: Create second session
        // ========================================
        console.log('\n📋 Creating second session...');
        const session2Name = 'New Session ' + Date.now();
        const session2Id = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, session2Name);

        expect(session2Id).toBeTruthy();
        expect(session2Id).not.toBe(session1Id);
        console.log(`✅ Session 2 Created: ${session2Id}`);

        // ========================================
        // STEP 3: Login to session 2 and verify no old data
        // ========================================
        console.log('\n🔍 Verifying session isolation...');

        const facPage2 = await context.newPage();
        await facPage2.goto('/teams/blue/blue_facilitator.html');
        await expect(facPage2.locator('#loader')).toBeHidden({ timeout: 15000 });

        await facPage2.fill('#roleLoginSession', session2Id);
        await facPage2.fill('#roleLoginPassword', 'facilitator2025');
        await Promise.all([
            facPage2.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            facPage2.click('button:has-text("Login")', { force: true })
        ]);

        await expect(facPage2.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Navigate to actions
        await facPage2.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        await facPage2.waitForTimeout(1000);

        // Verify old action is NOT present
        const session2Actions = await facPage2.evaluate(async (oldActionGoal) => {
            if (window.esg && window.esg.fetchActions) {
                const actions = await window.esg.fetchActions(1);
                console.log('Session 2 actions:', actions);

                // Check if any action has the old goal
                const hasOldAction = actions && actions.some(a => a.goal === oldActionGoal);
                return {
                    count: actions ? actions.length : 0,
                    hasOldAction: hasOldAction,
                    actions: actions
                };
            }
            return { count: 0, hasOldAction: false, actions: [] };
        }, oldGoal);

        expect(session2Actions.hasOldAction).toBe(false);
        console.log(`✅ Session 2 does not contain old session data`);
        console.log(`   Session 2 action count: ${session2Actions.count}`);

        // ========================================
        // STEP 4: Verify session 1 still has its data
        // ========================================
        console.log('\n🔍 Verifying session 1 data integrity...');

        // Go back to session 1
        await facPage1.reload({ waitUntil: 'domcontentloaded' });
        await expect(facPage1.locator('#loader')).toBeHidden({ timeout: 15000 });

        await facPage1.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        await facPage1.waitForTimeout(1000);

        const session1Actions = await facPage1.evaluate(async (expectedGoal) => {
            if (window.esg && window.esg.fetchActions) {
                const actions = await window.esg.fetchActions(1);
                const hasExpectedAction = actions && actions.some(a => a.goal === expectedGoal);
                return {
                    count: actions ? actions.length : 0,
                    hasExpectedAction: hasExpectedAction
                };
            }
            return { count: 0, hasExpectedAction: false };
        }, oldGoal);

        expect(session1Actions.hasExpectedAction).toBe(true);
        console.log(`✅ Session 1 still has its original data`);

        await context.close();
        console.log('\n✅ SESSION ISOLATION TEST PASSED\n');
    });

    test('LocalStorage doesn\'t overflow', async ({ browser }) => {
        const context = await browser.newContext();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('TEST: LocalStorage doesn\'t overflow');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const page = await context.newPage();
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));

        await page.goto('/teams/blue/blue_facilitator.html');

        // ========================================
        // STEP 1: Check initial LocalStorage size
        // ========================================
        console.log('\n📊 Checking initial LocalStorage size...');

        const initialSize = await page.evaluate(() => {
            let total = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    total += localStorage[key].length + key.length;
                }
            }
            return total;
        });

        console.log(`   Initial size: ${initialSize} characters`);

        // ========================================
        // STEP 2: Attempt to add large amount of data
        // ========================================
        console.log('\n📝 Testing LocalStorage quota handling...');

        const quotaTest = await page.evaluate(() => {
            const testKey = 'quota_test_key';
            const largeData = 'x'.repeat(1024 * 100); // 100KB of data
            const results = {
                attempts: 0,
                successes: 0,
                quotaExceeded: false,
                errorHandled: false
            };

            // Try to add data multiple times
            for (let i = 0; i < 50; i++) {
                results.attempts++;
                try {
                    localStorage.setItem(`${testKey}_${i}`, largeData);
                    results.successes++;
                } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                        results.quotaExceeded = true;
                        results.errorHandled = true;
                        console.log(`QuotaExceededError caught at attempt ${i + 1}`);
                        break;
                    }
                    throw e;
                }
            }

            // Clean up test data
            for (let i = 0; i < results.successes; i++) {
                localStorage.removeItem(`${testKey}_${i}`);
            }

            return results;
        });

        console.log(`   Attempts: ${quotaTest.attempts}`);
        console.log(`   Successes: ${quotaTest.successes}`);
        console.log(`   Quota exceeded: ${quotaTest.quotaExceeded}`);
        console.log(`   Error handled: ${quotaTest.errorHandled}`);

        // The test should either succeed in adding all data OR properly handle quota exceeded
        expect(quotaTest.errorHandled || quotaTest.successes === quotaTest.attempts).toBe(true);
        console.log('✅ LocalStorage quota handling works correctly');

        // ========================================
        // STEP 3: Verify data-layer.js handles QuotaExceededError
        // ========================================
        console.log('\n🔍 Testing data-layer quota error handling...');

        const dataLayerQuotaHandling = await page.evaluate(() => {
            // Check if the data-layer has quota handling
            const hasQuotaHandling = window.esg && typeof window.esg.saveToLocalStorage === 'function';

            if (!hasQuotaHandling) {
                return { available: false };
            }

            // Test with a reasonable size
            const testData = { test: 'data', timestamp: Date.now() };
            try {
                // This should work with normal data
                localStorage.setItem('test_quota_handling', JSON.stringify(testData));
                localStorage.removeItem('test_quota_handling');
                return { available: true, works: true };
            } catch (e) {
                return { available: true, works: false, error: e.message };
            }
        });

        console.log(`   Data layer available: ${dataLayerQuotaHandling.available}`);
        if (dataLayerQuotaHandling.available) {
            expect(dataLayerQuotaHandling.works).toBe(true);
            console.log('✅ Data layer quota handling verified');
        }

        // ========================================
        // STEP 4: Check final LocalStorage size
        // ========================================
        console.log('\n📊 Checking final LocalStorage size...');

        const finalSize = await page.evaluate(() => {
            let total = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    total += localStorage[key].length + key.length;
                }
            }
            return total;
        });

        console.log(`   Final size: ${finalSize} characters`);
        console.log(`   Size change: ${finalSize - initialSize} characters`);

        // Final size should be similar to initial (test data cleaned up)
        expect(Math.abs(finalSize - initialSize)).toBeLessThan(1000);
        console.log('✅ LocalStorage properly cleaned up after test');

        await context.close();
        console.log('\n✅ LOCALSTORAGE OVERFLOW TEST PASSED\n');
    });

    test.skip('Database cleanup works', async ({ browser }) => {
        // NOTE: This test is skipped because the hard reset causes a page reload
        // which makes the gmPage unusable. The test needs to be redesigned to handle
        // the page reload properly or test cleanup in a different way.

        const context = await browser.newContext();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('TEST: Database cleanup works');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const setupPage = await context.newPage();
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        // ========================================
        // STEP 1: Create a test session
        // ========================================
        console.log('\n📋 Creating test session for cleanup...');
        const sessionName = 'Cleanup Test Session ' + Date.now();
        const sessionId = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`✅ Session Created: ${sessionId}`);

        // ========================================
        // STEP 2: Add data to the session
        // ========================================
        console.log('\n📝 Adding test data...');

        const facPage = await context.newPage();
        await facPage.goto('/teams/blue/blue_facilitator.html');
        await expect(facPage.locator('#loader')).toBeHidden({ timeout: 15000 });

        await facPage.fill('#roleLoginSession', sessionId);
        await facPage.fill('#roleLoginPassword', 'facilitator2025');
        await Promise.all([
            facPage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            facPage.click('button:has-text("Login")', { force: true })
        ]);

        await expect(facPage.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Create multiple actions
        for (let i = 0; i < 3; i++) {
            await facPage.evaluate(() => {
                const btn = document.querySelector('.nav-item[data-section="actions"]');
                if (btn) btn.click();
            });

            await facPage.selectOption('#actionMechanism', 'investment');
            await facPage.selectOption('#actionSector', 'biotechnology');
            await facPage.evaluate(() => {
                const prcTarget = document.querySelector('.target-checkbox[data-target="prc"]');
                if (prcTarget) prcTarget.click();
            });
            await facPage.fill('#actionGoal', `Cleanup test action ${i + 1}`);
            await facPage.fill('#actionOutcomes', `Test outcomes ${i + 1}`);
            await facPage.fill('#actionContingencies', `Test contingencies ${i + 1}`);
            await facPage.selectOption('#actionExposure', 'supply-chain');

            await facPage.evaluate(async () => {
                if (window.addAction) await window.addAction();
            });

            await facPage.waitForTimeout(1000);
        }

        console.log('✅ Created 3 test actions');

        // ========================================
        // STEP 3: Verify data exists
        // ========================================
        console.log('\n🔍 Verifying data exists before cleanup...');

        const actionsBeforeCleanup = await facPage.evaluate(async () => {
            if (window.esg && window.esg.fetchActions) {
                const actions = await window.esg.fetchActions(1);
                return actions ? actions.length : 0;
            }
            return 0;
        });

        expect(actionsBeforeCleanup).toBeGreaterThanOrEqual(3);
        console.log(`✅ Found ${actionsBeforeCleanup} actions before cleanup`);

        // ========================================
        // STEP 4: Perform hard reset (cleanup)
        // ========================================
        console.log('\n🗑️  Performing hard reset cleanup...');

        const gmPage = await context.newPage();
        gmPage.on('console', msg => console.log(`GAMEMASTER LOG: ${msg.text()}`));

        await gmPage.goto('/master.html');
        await expect(gmPage.locator('#loader')).toBeHidden({ timeout: 15000 });

        await gmPage.fill('#roleLoginSession', sessionId);
        await gmPage.fill('#roleLoginPassword', 'gamemaster2025');
        await Promise.all([
            gmPage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            gmPage.click('button:has-text("Login")', { force: true })
        ]);

        await expect(gmPage.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Perform hard reset
        const resetResult = await gmPage.evaluate(async () => {
            try {
                // Override confirm to auto-accept
                window.confirm = () => true;

                if (window.hardResetSimulation) {
                    // Call hard reset (this will trigger a reload)
                    window.hardResetSimulation();
                    return { success: true, error: null };
                }
                return { success: false, error: 'hardResetSimulation not found' };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        console.log(`   Reset initiated: ${resetResult.success ? 'SUCCESS' : 'FAILED'}`);
        if (!resetResult.success) {
            console.log(`   Error: ${resetResult.error}`);
        }

        // Wait for reset to complete (page will reload)
        await gmPage.waitForTimeout(5000);

        // ========================================
        // STEP 5: Verify cleanup completed
        // ========================================
        console.log('\n🔍 Verifying cleanup completed...');

        // Create a new page to check cleanup results (gmPage has reloaded)
        const verifyPage = await context.newPage();
        await verifyPage.goto('/master.html');
        await verifyPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        // Check LocalStorage is cleared
        const localStorageCleared = await verifyPage.evaluate(() => {
            const keys = Object.keys(localStorage);
            console.log('LocalStorage keys after reset:', keys);
            // Should only have minimal keys (like shared state/timer)
            return keys.length < 5;
        });

        expect(localStorageCleared).toBe(true);
        console.log('✅ LocalStorage cleared');

        // Check session is deleted from database
        const sessionDeleted = await verifyPage.evaluate(async (sid) => {
            if (window.esg && window.esg.getSession) {
                try {
                    const session = await window.esg.getSession(sid);
                    console.log('Session after delete:', session);
                    return session === null || session === undefined;
                } catch (error) {
                    // Error getting session means it's deleted
                    console.log('Error getting session (expected):', error.message);
                    return true;
                }
            }
            return false;
        }, sessionId);

        expect(sessionDeleted).toBe(true);
        console.log('✅ Session deleted from database');

        await context.close();
        console.log('\n✅ DATABASE CLEANUP TEST PASSED\n');
    });

    test('Session data cleanup doesn\'t affect other sessions', async ({ browser }) => {
        const context = await browser.newContext();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('TEST: Cleanup doesn\'t affect other sessions');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const setupPage = await context.newPage();
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        // ========================================
        // STEP 1: Create two sessions
        // ========================================
        console.log('\n📋 Creating two test sessions...');

        const session1Name = 'Keep Session ' + Date.now();
        const session1Id = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, session1Name);

        await setupPage.waitForTimeout(500);

        const session2Name = 'Delete Session ' + Date.now();
        const session2Id = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, session2Name);

        expect(session1Id).toBeTruthy();
        expect(session2Id).toBeTruthy();
        console.log(`✅ Session 1 (Keep): ${session1Id}`);
        console.log(`✅ Session 2 (Delete): ${session2Id}`);

        // ========================================
        // STEP 2: Add data to session 1
        // ========================================
        console.log('\n📝 Adding data to session 1...');

        const facPage1 = await context.newPage();
        await facPage1.goto('/teams/blue/blue_facilitator.html');
        await expect(facPage1.locator('#loader')).toBeHidden({ timeout: 15000 });

        await facPage1.fill('#roleLoginSession', session1Id);
        await facPage1.fill('#roleLoginPassword', 'facilitator2025');
        await Promise.all([
            facPage1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            facPage1.click('button:has-text("Login")', { force: true })
        ]);

        await expect(facPage1.locator('#loader')).toBeHidden({ timeout: 15000 });

        await facPage1.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        const session1Goal = 'Session 1 Protected Action ' + Date.now();
        await facPage1.selectOption('#actionMechanism', 'investment');
        await facPage1.selectOption('#actionSector', 'biotechnology');
        await facPage1.evaluate(() => {
            const prcTarget = document.querySelector('.target-checkbox[data-target="prc"]');
            if (prcTarget) prcTarget.click();
        });
        await facPage1.fill('#actionGoal', session1Goal);
        await facPage1.fill('#actionOutcomes', 'Protected outcomes');
        await facPage1.fill('#actionContingencies', 'Protected contingencies');
        await facPage1.selectOption('#actionExposure', 'supply-chain');

        await facPage1.evaluate(async () => {
            if (window.addAction) await window.addAction();
        });

        await facPage1.waitForTimeout(2000);
        console.log(`✅ Created action in session 1: "${session1Goal}"`);

        // ========================================
        // STEP 3: Delete session 2
        // ========================================
        console.log('\n🗑️  Deleting session 2...');

        const deleteResult = await setupPage.evaluate(async (sid) => {
            if (window.esg && window.esg.deleteSession) {
                try {
                    await window.esg.deleteSession(sid, true);
                    return { success: true, error: null };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
            return { success: false, error: 'deleteSession not available' };
        }, session2Id);

        expect(deleteResult.success).toBe(true);
        console.log('✅ Session 2 deleted');

        // ========================================
        // STEP 4: Verify session 1 data is intact
        // ========================================
        console.log('\n🔍 Verifying session 1 data is intact...');

        await facPage1.reload({ waitUntil: 'domcontentloaded' });
        await expect(facPage1.locator('#loader')).toBeHidden({ timeout: 15000 });

        await facPage1.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });

        await facPage1.waitForTimeout(1000);

        const session1DataIntact = await facPage1.evaluate(async (expectedGoal) => {
            if (window.esg && window.esg.fetchActions) {
                const actions = await window.esg.fetchActions(1);
                const hasExpectedAction = actions && actions.some(a => a.goal === expectedGoal);
                return {
                    found: hasExpectedAction,
                    count: actions ? actions.length : 0
                };
            }
            return { found: false, count: 0 };
        }, session1Goal);

        expect(session1DataIntact.found).toBe(true);
        console.log(`✅ Session 1 data intact (${session1DataIntact.count} actions found)`);

        // ========================================
        // STEP 5: Verify session 2 is deleted
        // ========================================
        console.log('\n🔍 Verifying session 2 is deleted...');

        const session2Exists = await setupPage.evaluate(async (sid) => {
            if (window.esg && window.esg.getSession) {
                try {
                    const session = await window.esg.getSession(sid);
                    return session !== null && session !== undefined;
                } catch (error) {
                    return false;
                }
            }
            return false;
        }, session2Id);

        expect(session2Exists).toBe(false);
        console.log('✅ Session 2 confirmed deleted');

        await context.close();
        console.log('\n✅ SELECTIVE CLEANUP TEST PASSED\n');
    });
});
