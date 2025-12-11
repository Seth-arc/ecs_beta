// tests/navigation.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Navigation and Deep Linking', () => {

    test.beforeEach(async ({ page }) => {
        // Monitor console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        // Setup mock session
        await page.addInitScript(() => {
            window.sessionStorage.setItem('esg_role', 'blue_facilitator');
            window.sessionStorage.setItem('esg_session_id', 'test-session-id');
            window.localStorage.clear();

            // Shim utils if missing
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
                    window.localStorage.setItem(key, JSON.stringify(val));
                    return true;
                };
            }
        });

        // Mock window.esg
        await page.addInitScript(() => {
            const getStored = (key) => JSON.parse(localStorage.getItem(key) || '[]');
            const setStored = (key, val) => localStorage.setItem(key, JSON.stringify(val));

            window.esg = {
                fetchGameState: async () => ({ move: 1, phase: 1 }),

                fetchActions: async () => getStored('mock_actions'),
                submitAction: async (data) => {
                    console.log('Mock submitAction called');
                    const actions = getStored('mock_actions');
                    actions.push({ ...data, id: Date.now().toString(), status: 'draft', timestamp: new Date().toISOString() });
                    setStored('mock_actions', actions);
                    return true;
                },
                updateAction: async (id, data) => true,

                fetchRequests: async () => {
                    const reqs = getStored('mock_requests');
                    console.log('Mock fetchRequests returning:', reqs.length);
                    return reqs;
                },
                submitRequest: async (data) => {
                    console.log('Mock submitRequest called with:', JSON.stringify(data));
                    const requests = getStored('mock_requests');
                    requests.push({ ...data, query: data.details, id: Date.now().toString(), timestamp: new Date().toISOString() });
                    setStored('mock_requests', requests);
                    return true;
                },

                fetchCommunications: async () => [],
                getSessionName: async () => 'Test Session',
                getClientId: () => 'test-client-id',
                subscribeToActions: () => { },
                subscribeToRequests: () => { },
                subscribeToCommunications: () => { },
                checkRoleAvailability: async () => ({ available: true }),
                registerSessionParticipant: async () => true,
                joinSession: async () => true,
                login: () => true,
                showToast: (msg) => console.log('Toast:', msg)
            };
        });

        await page.goto('/teams/blue/blue_facilitator.html');
        // Wait for page to be ready
        await page.waitForSelector('.header-title h1', { state: 'visible' });
        await page.waitForSelector('#roleLoginOverlay', { state: 'hidden' });
    });

    test('Validates navigation buttons switch sections correctly', async ({ page }) => {
        // Initial state should be info-requests
        await expect(page.locator('#info-requests')).toHaveClass(/active/);
        await expect(page.locator('.nav-item[data-section="info-requests"]')).toHaveClass(/active/);

        // Click Actions
        await page.click('.nav-item[data-section="actions"]');
        await expect(page.locator('#actions')).toHaveClass(/active/);
        await expect(page.locator('.nav-item[data-section="actions"]')).toHaveClass(/active/);
        await expect(page.locator('#info-requests')).not.toHaveClass(/active/);

        // Click Observations
        await page.click('.nav-item[data-section="observations"]');
        await expect(page.locator('#observations')).toHaveClass(/active/);

        // Click Timeline
        await page.click('.nav-item[data-section="timeline"]');
        await expect(page.locator('#timeline')).toHaveClass(/active/);

        // Click White Responses
        await page.click('.nav-item[data-section="white-responses"]');
        await expect(page.locator('#white-responses')).toHaveClass(/active/);
    });

    test('Section switching preserves data', async ({ page }) => {
        // 1. Enter data in Info Requests
        await page.click('.nav-item[data-section="info-requests"]');
        await page.selectOption('#requestPriority', 'high');
        await page.click('.category-checkbox[data-category="economic"]'); // Select a category
        await page.fill('#requestDetails', 'Test Preservation Request');

        await page.click('button:has-text("Submit Request")');

        // Verify it appears in the list
        await expect(page.locator('#pendingRequests')).toContainText('Test Preservation Request');

        // 2. Switch to Actions
        await page.click('.nav-item[data-section="actions"]');
        await expect(page.locator('#actions')).toBeVisible();

        // 3. Switch back to Info Requests
        await page.click('.nav-item[data-section="info-requests"]');

        // 4. Verify data is still there
        await expect(page.locator('#pendingRequests')).toContainText('Test Preservation Request');
    });

    test('Deep linking to sections works', async ({ page }) => {
        // Navigate directly to hash #actions
        await page.goto('/teams/blue/blue_facilitator.html#actions');
        await page.waitForSelector('.header-title h1', { state: 'visible' });
        await page.waitForSelector('#roleLoginOverlay', { state: 'hidden' });

        // Verify Actions tab is active
        await expect(page.locator('#actions')).toHaveClass(/active/);
        await expect(page.locator('.nav-item[data-section="actions"]')).toHaveClass(/active/);

        // Navigate to #observations
        await page.goto('/teams/blue/blue_facilitator.html#observations');
        await expect(page.locator('#observations')).toHaveClass(/active/);
    });

    test('Back/forward browser buttons work', async ({ page }) => {
        // This test requires pushState integration in the app

        // 1. Start at Info Requests
        await page.goto('/teams/blue/blue_facilitator.html#info-requests');
        await expect(page.locator('#info-requests')).toHaveClass(/active/);

        // 2. Click Actions (should push state)
        await page.click('.nav-item[data-section="actions"]');
        await expect(page.locator('#actions')).toHaveClass(/active/);

        // 3. Click Observations (should push state)
        await page.click('.nav-item[data-section="observations"]');
        await expect(page.locator('#observations')).toHaveClass(/active/);

        // 4. Go Back -> Actions
        await page.goBack();
        await expect(page.locator('#actions')).toHaveClass(/active/);

        // 5. Go Back -> Info Requests
        await page.goBack();
        await expect(page.locator('#info-requests')).toHaveClass(/active/);

        // 6. Go Forward -> Actions
        await page.goForward();
        await expect(page.locator('#actions')).toHaveClass(/active/);
    });
});
