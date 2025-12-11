import { test, expect } from '@playwright/test';

test.describe('ESG Platform Features', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/master.html');
        await page.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);
    });

    test('Data Layer API should be exposed via window.esg', async ({ page }) => {
        const isAvailable = await page.evaluate(() => window.esg.isSupabaseAvailable());
        console.log(`Supabase Available: ${isAvailable}`);

        const methods = await page.evaluate(() => {
            return {
                createSession: typeof window.esg.createSession === 'function',
                fetchGameState: typeof window.esg.fetchGameState === 'function',
                submitAction: typeof window.esg.submitAction === 'function',
                hasGlobalCreateBackup: typeof window.createBackup === 'function'
            };
        });

        expect(methods.createSession, 'createSession should be defined').toBeTruthy();
        expect(methods.fetchGameState, 'fetchGameState should be defined').toBeTruthy();
        expect(methods.submitAction, 'submitAction should be defined').toBeTruthy();
        expect(methods.hasGlobalCreateBackup, 'Global createBackup should be defined').toBeTruthy();
    });

    test('Session Management: Create Session', async ({ page }) => {
        const sessionName = 'Test Session ' + Date.now();
        const sessionId = await page.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`Created Session ID: ${sessionId}`);

        const sessions = await page.evaluate(async () => {
            return await window.esg.fetchAllSessions();
        });

        const createdSession = sessions.find(s => s.id === sessionId);
        expect(createdSession).toBeDefined();
        expect(createdSession.name).toBe(sessionName);
    });

    test('Game State: Fetch Initial State', async ({ page }) => {
        const sessionName = 'GameState Test ' + Date.now();
        const sessionId = await page.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        const gameState = await page.evaluate(async (sid) => {
            return await window.esg.fetchGameState(sid);
        }, sessionId);

        console.log('Game State:', gameState);
    });

    test('Local Persistence: Client ID generation', async ({ page }) => {
        const clientId = await page.evaluate(() => window.esg.getClientId());
        expect(clientId).toBeTruthy();

        await page.reload();
        await page.waitForFunction(() => window.esg);

        const clientIdAfterReload = await page.evaluate(() => window.esg.getClientId());
        expect(clientIdAfterReload).toBe(clientId);
    });

});

test.describe('Role Page Initialization', () => {
    const roles = [
        { name: 'Facilitator', url: '/teams/blue/blue_facilitator.html' },
        { name: 'Notetaker', url: '/teams/blue/blue_notetaker.html' },
        { name: 'White Cell', url: '/teams/blue/blue_white_cell.html' }
    ];

    for (const role of roles) {
        test(`${role.name} page should load and initialize data layer`, async ({ page }) => {
            await page.goto(role.url);

            // Wait for esg object
            await page.waitForFunction(() => window.esg);
            const isReady = await page.evaluate(() => !!window.esg);
            expect(isReady).toBeTruthy();

            // Check if scripts specific to role are loaded
            // Example: Facilitator should have `facilitator.js` logic if we checked specifics, but window.esg is the shared core.
        });
    }
});
