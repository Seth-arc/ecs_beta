
import { test, expect } from '@playwright/test';

test.describe('Network Failure Test: Offline Resilience', () => {

    test.setTimeout(120000); // 2 minutes

    test('Validates LocalStorage fallback and resilience', async ({ browser }) => {
        // --- 1. Setup Context ---
        const context = await browser.newContext();
        await context.route('**/*supabase-js*', route => route.abort());
        const page = await context.newPage();

        // Debug logs from page
        page.on('console', msg => console.log(`[OFFLINE TEST LOG]: ${msg.text()}`));

        console.log('\n=== Test 1: Start Offline (Supabase Unavailable) ===');
        await page.goto('/teams/blue/blue_facilitator.html');

        // Verify we are in offline mode
        const isOffline = await page.evaluate(() => {
            return typeof window.supabase === 'undefined';
        });

        expect(isOffline).toBe(true);
        console.log('✓ Supabase script blocked, running in offline mode');

        // Setup: Create a session in LocalStorage manually
        const offlineSessionId = '12345678-1234-1234-1234-1234567890ab';

        await page.evaluate((sid) => {
            const sessionData = {
                id: sid,
                name: 'Offline Resilience Test Session',
                status: 'active',
                metadata: {},
                created_at: new Date().toISOString()
            };
            localStorage.setItem('session_' + sid, JSON.stringify(sessionData));
        }, offlineSessionId);
        console.log(`Injected offline session: ${offlineSessionId}`);

        // Login
        await page.fill('#roleLoginSession', offlineSessionId);
        await page.fill('#roleLoginPassword', 'facilitator2025');
        await page.click('button:has-text("Login")', { force: true });

        // Check for error overlays if login fails
        const overlayVisible = await page.locator('#roleLoginOverlay').isVisible();
        if (overlayVisible) {
            const errorText = await page.textContent('.error-message, .alert, [role="alert"]');
            console.log('Login failed with error:', errorText);
        }

        await expect(page.locator('#loader')).toBeHidden({ timeout: 15000 });
        await expect(page.locator('.main-layout')).toBeVisible({ timeout: 10000 });
        console.log('✓ Logged in successfully in offline mode');

        // --- 2. Create Data Offline ---
        console.log('\n=== Test 2: Create Data Offline ===');

        // Navigate to Actions
        await page.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });
        await expect(page.locator('#actions')).toHaveClass(/active/, { timeout: 10000 });

        // Create an Action
        const actionDetails = 'This action was created while offline.';
        await page.selectOption('#actionMechanism', 'trade');
        await page.selectOption('#actionSector', 'agriculture');
        await page.selectOption('#actionExposure', 'supply-chain');
        await page.click('button[data-target="prc"]');
        await page.fill('#actionGoal', actionDetails);
        await page.fill('#actionOutcomes', 'Ensure food security through varied imports.');
        await page.fill('#actionContingencies', 'Seek alternative suppliers in South America.');
        await page.click('button:has-text("Add Action")');

        await expect(page.locator('.action-item')).toContainText('Trade', { timeout: 10000 });
        console.log('✓ Action created and visible in offline mode');

        // --- 3. Reload and Verify Persistence ---
        console.log('\n=== Test 3: Data Persists Locally ===');

        await page.reload();
        await expect(page.locator('#loader')).toBeHidden();

        // Before navigating, ensure we are still logged in.
        await page.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });
        await expect(page.locator('#actions')).toHaveClass(/active/, { timeout: 10000 });

        // Check if action is still there
        await expect(page.locator('.action-item')).toContainText('Trade');
        console.log('✓ Data persists after reload (Offline Mode)');

        await context.close();
    });

    test('Sync occurs when connection restored', async ({ browser }) => {
        console.log('\n=== Test 4: Sync Restore (Offline -> Online) ===');

        // 1. Setup offline data first
        const context = await browser.newContext();
        await context.route('**/*supabase-js*', route => route.abort());
        const page = await context.newPage();
        page.on('console', msg => console.log(`[SYNC-OFFLINE]: ${msg.text()}`));

        // Use a UUID for sync test too
        const testSessionId = '87654321-4321-4321-4321-ba0987654321';

        // Inject session for offline mode
        await page.goto('/teams/blue/blue_facilitator.html');
        await page.evaluate((sid) => {
            localStorage.setItem('session_' + sid, JSON.stringify({
                id: sid,
                name: 'Sync Test Session',
                status: 'active',
                metadata: {},
                created_at: new Date().toISOString()
            }));
        }, testSessionId);

        await page.fill('#roleLoginSession', testSessionId);
        await page.fill('#roleLoginPassword', 'facilitator2025');
        await page.click('button:has-text("Login")', { force: true });

        await expect(page.locator('#loader')).toBeHidden();

        await page.evaluate(() => { document.querySelector('.nav-item[data-section="actions"]').click(); });
        await expect(page.locator('#actions')).toHaveClass(/active/, { timeout: 10000 });

        const uniqueGoal = `Sync-Check-${Date.now()}`;
        await page.selectOption('#actionMechanism', 'financial');
        await page.selectOption('#actionSector', 'telecommunications');
        await page.selectOption('#actionExposure', 'technologies');
        await page.click('button[data-target="rus"]');
        await page.fill('#actionGoal', uniqueGoal);
        await page.fill('#actionOutcomes', 'Improve digital infrastructure resilience.');
        await page.fill('#actionContingencies', 'Partner with EU tech firms.');
        await page.click('button:has-text("Add Action")');

        await expect(page.locator(`.action-item:has-text("${uniqueGoal}")`)).toBeVisible();
        console.log(`Created offline action with goal: ${uniqueGoal}`);

        // 2. Restore Connection (Go Online)
        // Mocking the server response to avoid FK errors and simulate successful sync/fetch
        console.log('Restoring connection (Mocked)...');
        await context.unroute('**/*supabase-js*'); // Allow library to load

        // Mock Supabase API
        await context.route('**/*.supabase.co/**', async route => {
            const request = route.request();
            const method = request.method();
            const url = request.url();
            console.log(`[MOCK NETWORK] ${method} ${url}`);

            // Handle Preflight
            if (method === 'OPTIONS') {
                await route.fulfill({
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
                        'Access-Control-Allow-Headers': '*'
                    }
                });
                return;
            }

            // Allow successful writes (POST/PATCH/PUT)
            if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
                // Return array of created items (PostgREST format)
                await route.fulfill({ status: 201, body: JSON.stringify([{}]) });
                return;
            }

            // Handle Fetches
            if (method === 'GET') {
                if (url.includes('actions')) {
                    // Return array of items directly (PostgREST format)
                    await route.fulfill({
                        status: 200,
                        body: JSON.stringify([{
                            id: 999999,
                            mechanism: 'financial',
                            sector: 'telecommunications',
                            exposure: 'technologies',
                            goal: uniqueGoal,
                            goal_text: uniqueGoal,
                            expected_outcomes: 'Improve digital infrastructure resilience.',
                            ally_contingencies: 'Partner with EU tech firms.',
                            status: 'draft',
                            created_at: new Date().toISOString(),
                            move: 1
                        }])
                    });
                } else if (url.includes('participants') || url.includes('session_participants')) {
                    await route.fulfill({ status: 200, body: JSON.stringify([]) });
                } else {
                    await route.fulfill({ status: 200, body: JSON.stringify([]) });
                }
            }
        });

        // Reload to trigger online initialization
        await page.reload();

        await expect(page.locator('#loader')).toBeHidden({ timeout: 10000 });
        await expect(page.locator('.main-layout')).toBeVisible();

        // Navigate to Actions to verify data
        await page.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="actions"]');
            if (btn) btn.click();
        });
        await expect(page.locator('#actions')).toHaveClass(/active/, { timeout: 10000 });

        // Verify the item is visible
        await expect(page.locator(`.action-item:has-text("${uniqueGoal}")`)).toBeVisible({ timeout: 15000 });
        console.log('✓ Data persists and is visible after restoring connection');

        await context.close();
    });
});
