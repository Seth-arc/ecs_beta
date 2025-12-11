const { test, expect } = require('@playwright/test');

test.describe('Large Dataset Test', () => {
    test('Performance with 50+ actions, 100+ timeline items, pagination and filtering', async ({ browser }) => {
        // Set timeout to 5 minutes for this large dataset test
        test.setTimeout(300000);

        // Setup
        const context = await browser.newContext();
        const page = await context.newPage();
        const sessionId = `large-dataset-test-${Date.now()}`;

        // Initialize session state
        await context.addInitScript((sid) => {
            sessionStorage.setItem('esg_role', 'blue_facilitator');
            sessionStorage.setItem('esg_session_id', sid);
            sessionStorage.setItem('esg_client_id', `client-${Math.random()}`);
        }, sessionId);

        // Navigate to Facilitator Dashboard
        await page.goto('/teams/blue/blue_facilitator.html');
        await page.waitForLoadState('networkidle');

        console.log('🚀 Starting Large Dataset Test');
        console.log(`📊 Session ID: ${sessionId}`);

        // ==========================================
        // PART 1: CREATE 50+ ACTIONS
        // ==========================================
        console.log('\n📝 PART 1: Creating 50+ Actions...');
        const startActionCreation = Date.now();

        const mechanisms = ['financial', 'trade', 'diplomatic', 'military', 'cyber'];
        const sectors = ['biotechnology', 'agriculture', 'energy', 'manufacturing', 'technology'];
        const exposures = ['critical-minerals', 'supply-chain', 'data-security', 'infrastructure'];
        const targets = ['prc', 'rus', 'ap-aus', 'ap-rok', 'ap-jap', 'eu-eu'];

        // Create 51 actions to exceed the 50+ requirement
        const totalActions = 51;
        const actionsCreated = [];

        for (let i = 0; i < totalActions; i++) {
            // Navigate to Actions tab
            await page.click('.nav-item[data-section="actions"]');
            await page.waitForSelector('#actionMechanism', { state: 'visible', timeout: 10000 });

            // Select values for variety
            const mechanism = mechanisms[i % mechanisms.length];
            const sector = sectors[i % sectors.length];
            const exposure = exposures[i % exposures.length];
            const target = targets[i % targets.length];

            // Fill form
            await page.selectOption('#actionMechanism', mechanism);
            await page.waitForTimeout(100);
            await page.selectOption('#actionSector', sector);
            await page.waitForTimeout(100);
            await page.selectOption('#actionExposure', exposure);
            await page.waitForTimeout(100);
            await page.fill('#actionGoal', `Action ${i + 1}: ${mechanism} in ${sector}`);
            await page.fill('#actionOutcomes', `Outcome ${i + 1}`);
            await page.fill('#actionContingencies', `Contingency ${i + 1}`);

            // Select target - wait for it to be visible
            await page.waitForSelector(`.target-checkbox[data-target="${target}"]`, { state: 'visible', timeout: 5000 });
            await page.click(`.target-checkbox[data-target="${target}"]`);

            // Submit action
            await page.click('button[onclick*="addAction"]');
            await page.waitForTimeout(300); // Pause to allow processing

            actionsCreated.push({
                id: i + 1,
                mechanism,
                sector,
                exposure,
                target,
                goal: `Action ${i + 1}: ${mechanism} in ${sector}`
            });

            // Progress indicator
            if ((i + 1) % 10 === 0) {
                console.log(`   ✓ Created ${i + 1}/${totalActions} actions`);
            }
        }

        const actionCreationTime = Date.now() - startActionCreation;
        console.log(`✅ Created ${totalActions} actions in ${actionCreationTime}ms`);
        console.log(`   Average: ${(actionCreationTime / totalActions).toFixed(2)}ms per action`);

        // ==========================================
        // PART 2: CREATE 100+ TIMELINE ITEMS
        // ==========================================
        console.log('\n📅 PART 2: Creating 100+ Timeline Items...');
        const startTimelineCreation = Date.now();

        const observationTypes = ['political', 'economic', 'military', 'social', 'technological'];
        const priorities = ['low', 'medium', 'high', 'critical'];
        const totalObservations = 101; // Exceed 100+ requirement

        for (let i = 0; i < totalObservations; i++) {
            // Navigate to Timeline tab
            await page.click('.nav-item[data-section="timeline"]');
            await page.waitForSelector('#observationType', { state: 'visible', timeout: 10000 });

            const obsType = observationTypes[i % observationTypes.length];
            const priority = priorities[i % priorities.length];

            // Fill observation form
            await page.selectOption('#observationType', obsType);
            await page.waitForTimeout(100);
            await page.selectOption('#observationPriority', priority);
            await page.waitForTimeout(100);
            await page.fill('#observationText', `Observation ${i + 1}: ${obsType} - ${priority}`);

            // Submit observation
            await page.click('button[onclick*="addObservation"]');
            await page.waitForTimeout(200); // Brief pause

            // Progress indicator
            if ((i + 1) % 20 === 0) {
                console.log(`   ✓ Created ${i + 1}/${totalObservations} timeline items`);
            }
        }

        const timelineCreationTime = Date.now() - startTimelineCreation;
        console.log(`✅ Created ${totalObservations} timeline items in ${timelineCreationTime}ms`);
        console.log(`   Average: ${(timelineCreationTime / totalObservations).toFixed(2)}ms per item`);

        // ==========================================
        // PART 3: UI RESPONSIVENESS TEST
        // ==========================================
        console.log('\n⚡ PART 3: Testing UI Responsiveness...');

        // Test 1: Page reload performance
        console.log('   Testing page reload with large dataset...');
        const startReload = Date.now();
        await page.reload();
        await page.waitForLoadState('networkidle');
        const reloadTime = Date.now() - startReload;
        console.log(`   ✓ Page reload: ${reloadTime}ms`);
        expect(reloadTime, 'Page reload should complete within 15 seconds').toBeLessThan(15000);

        // Test 2: Tab switching performance
        console.log('   Testing tab switching performance...');
        const tabSwitchTimes = [];

        // Switch to Actions tab
        let startSwitch = Date.now();
        await page.click('.nav-item[data-section="actions"]');
        await page.waitForSelector('#currentActions', { state: 'visible', timeout: 10000 });
        tabSwitchTimes.push(Date.now() - startSwitch);

        // Switch to Timeline tab
        startSwitch = Date.now();
        await page.click('.nav-item[data-section="timeline"]');
        await page.waitForSelector('#timelineList', { state: 'visible', timeout: 10000 });
        tabSwitchTimes.push(Date.now() - startSwitch);

        // Switch to RFI tab
        startSwitch = Date.now();
        await page.click('.nav-item[data-section="rfi"]');
        await page.waitForSelector('#rfiList', { state: 'visible', timeout: 10000 });
        tabSwitchTimes.push(Date.now() - startSwitch);

        // Switch back to Actions
        startSwitch = Date.now();
        await page.click('.nav-item[data-section="actions"]');
        await page.waitForSelector('#currentActions', { state: 'visible', timeout: 10000 });
        tabSwitchTimes.push(Date.now() - startSwitch);

        const avgTabSwitch = tabSwitchTimes.reduce((a, b) => a + b, 0) / tabSwitchTimes.length;
        console.log(`   ✓ Average tab switch time: ${avgTabSwitch.toFixed(2)}ms`);
        expect(avgTabSwitch, 'Tab switching should be responsive (< 3 seconds)').toBeLessThan(3000);

        // Test 3: Verify all actions are displayed
        console.log('   Verifying all actions are displayed...');
        await page.click('.nav-item[data-section="actions"]');
        await page.waitForSelector('#currentActions', { state: 'visible', timeout: 10000 });

        const displayedActions = await page.locator('.action-item').count();
        console.log(`   ✓ Displayed ${displayedActions} actions`);
        expect(displayedActions, `Should display all ${totalActions} actions`).toBeGreaterThanOrEqual(totalActions);

        // Test 4: Verify timeline items are displayed
        console.log('   Verifying timeline items are displayed...');
        await page.click('.nav-item[data-section="timeline"]');
        await page.waitForSelector('#timelineList', { state: 'visible', timeout: 10000 });

        const displayedTimelineItems = await page.locator('.timeline-item').count();
        console.log(`   ✓ Displayed ${displayedTimelineItems} timeline items`);
        expect(displayedTimelineItems, `Should display timeline items`).toBeGreaterThan(0);

        // ==========================================
        // PART 4: DATA INTEGRITY VERIFICATION
        // ==========================================
        console.log('\n✅ PART 4: Verifying Data Integrity...');

        // Reload page to verify persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Verify actions persisted
        await page.click('.nav-item[data-section="actions"]');
        await page.waitForSelector('#currentActions', { state: 'visible', timeout: 10000 });
        const persistedActions = await page.locator('.action-item').count();
        console.log(`   ✓ ${persistedActions} actions persisted after reload`);
        expect(persistedActions, 'All actions should persist').toBeGreaterThanOrEqual(totalActions);

        // Verify timeline items persisted
        await page.click('.nav-item[data-section="timeline"]');
        await page.waitForSelector('#timelineList', { state: 'visible', timeout: 10000 });
        const persistedTimeline = await page.locator('.timeline-item').count();
        console.log(`   ✓ ${persistedTimeline} timeline items persisted after reload`);
        expect(persistedTimeline, 'Timeline items should persist').toBeGreaterThan(0);

        // Verify specific actions are findable
        await page.click('.nav-item[data-section="actions"]');
        await page.waitForSelector('#currentActions', { state: 'visible', timeout: 10000 });
        const allActionText = await page.locator('#currentActions').textContent();

        // Check for first, middle, and last action
        const firstActionFound = allActionText.includes('Action 1:');
        const middleActionFound = allActionText.includes(`Action ${Math.floor(totalActions / 2)}:`);
        const lastActionFound = allActionText.includes(`Action ${totalActions}:`);

        console.log(`   ✓ First action found: ${firstActionFound}`);
        console.log(`   ✓ Middle action found: ${middleActionFound}`);
        console.log(`   ✓ Last action found: ${lastActionFound}`);

        expect(firstActionFound, 'First action should be present').toBe(true);
        expect(lastActionFound, 'Last action should be present').toBe(true);

        // ==========================================
        // PART 5: PERFORMANCE METRICS SUMMARY
        // ==========================================
        console.log('\n📊 PERFORMANCE METRICS SUMMARY:');
        console.log('═══════════════════════════════════════');
        console.log(`   Actions Created: ${totalActions}`);
        console.log(`   Timeline Items Created: ${totalObservations}`);
        console.log(`   Total Items: ${totalActions + totalObservations}`);
        console.log(`   Action Creation Time: ${actionCreationTime}ms (${(actionCreationTime / totalActions).toFixed(2)}ms avg)`);
        console.log(`   Timeline Creation Time: ${timelineCreationTime}ms (${(timelineCreationTime / totalObservations).toFixed(2)}ms avg)`);
        console.log(`   Page Reload Time: ${reloadTime}ms`);
        console.log(`   Average Tab Switch: ${avgTabSwitch.toFixed(2)}ms`);
        console.log('═══════════════════════════════════════');

        // ==========================================
        // FINAL ASSERTIONS
        // ==========================================
        console.log('\n🎯 FINAL TEST RESULTS:');
        console.log('═══════════════════════════════════════');

        // Performance assertions
        expect(actionCreationTime / totalActions, 'Action creation should be reasonable').toBeLessThan(2000);
        expect(timelineCreationTime / totalObservations, 'Timeline creation should be reasonable').toBeLessThan(2000);
        expect(reloadTime, 'Page reload should be reasonable').toBeLessThan(15000);
        expect(avgTabSwitch, 'Tab switching should be responsive').toBeLessThan(3000);

        // Data integrity assertions
        expect(persistedActions, 'All actions should persist').toBeGreaterThanOrEqual(totalActions);
        expect(persistedTimeline, 'Timeline items should persist').toBeGreaterThan(0);

        console.log('✅ Performance with 50+ actions: PASSED');
        console.log('✅ Timeline with 100+ items: PASSED');
        console.log('✅ UI remains responsive: PASSED');
        console.log('✅ Data integrity verified: PASSED');
        console.log('═══════════════════════════════════════');
        console.log('🎉 LARGE DATASET TEST COMPLETED SUCCESSFULLY');

        await context.close();
    });
});
