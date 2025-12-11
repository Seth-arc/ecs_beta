
import { test, expect } from '@playwright/test';

test.describe('Game Master Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Mock Supabase
        await page.route('**/*supabase-js*', async route => {
            // Let the CDN load, or if we want to block it and rely on mock, we can abort. 
            // But the app might depend on `Supabase` global.
            // We'll just continue.
            await route.continue();
        });

        // Mock Supabase API calls
        await page.route('**/*.supabase.co/**', async route => {
            const request = route.request();
            const url = request.url();
            const method = request.method();

            // Handle Preflight options
            if (method === 'OPTIONS') {
                await route.fulfill({
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
                        'Access-Control-Allow-Headers': '*'
                    }
                });
                return;
            }

            // Mock Sessions
            // Matches: /rest/v1/sessions
            if (url.includes('sessions') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify([{
                        id: 'session-123',
                        name: 'Test Session',
                        status: 'active',
                        created_at: new Date().toISOString()
                    }])
                });
                return;
            }

            // Mock Game State - Critical for determining currentMove
            if (url.includes('game_state')) {
                // If it's a select
                if (method === 'GET') {
                    await route.fulfill({
                        status: 200,
                        body: JSON.stringify({
                            id: 1,
                            move: 1,
                            phase: 1,
                            session_id: 'session-123'
                        })
                    });
                    return;
                }
            }

            // Mock Actions
            if (url.includes('actions') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify([{
                        id: 1,
                        mechanism: 'Test Mechanism',
                        sector: 'Test Sector',
                        goal: 'Test Goal',
                        status: 'pending',
                        created_at: new Date().toISOString()
                    }])
                });
                return;
            }

            // Mock Requests
            if (url.includes('requests') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify([{
                        id: 1,
                        query: 'Test Request Query', // The code displays 'query' usually, or maps it.
                        request_text: 'Test Request Text',
                        status: 'pending',
                        created_at: new Date().toISOString()
                    }])
                });
                return;
            }

            // Mock Timeline
            if (url.includes('timeline') && method === 'GET') {
                await route.fulfill({ status: 200, body: JSON.stringify([]) });
                return;
            }

            // Mock Participants
            if (url.includes('participants')) {
                await route.fulfill({ status: 200, body: JSON.stringify([]) });
                return;
            }

            // Default success for others (including heartbeats etc)
            await route.fulfill({ status: 200, body: JSON.stringify([]) });
        });
    });

    test('Game Master authentication and session view', async ({ page }) => {
        await page.goto('/master.html');

        // Handle Login Overlay
        const overlay = page.locator('#loginOverlay');
        await expect(overlay).toBeVisible();
        await page.fill('#loginPassword', 'admin2025');
        await page.click('button:has-text("Login")');
        await expect(overlay).toBeHidden();

        // Verify Dashboard
        await expect(page.locator('.header-title h1')).toHaveText('Game Master Control');

        // Select a Session (Mocked list should appear)
        await page.click('[data-section="sessions"]');

        // Wait for sessions to load
        await expect(page.locator('#availableSessionsList')).toContainText('Test Session');

        // Click Select
        await page.click('button:has-text("Select")');

        // Wait for selection to confirm via UI update
        await expect(page.locator('#sessionStatus')).toContainText('Managing session: Test Session');

        // Verify Action Data View
        await page.click('[data-section="actions"]');
        await expect(page.locator('#actions')).toHaveClass(/active/);

        // Since renderActions is async and triggered by click, we wait for content.
        await expect(page.locator('#actionsFeed')).toContainText('Test Mechanism');

        // Verify Requests Data View
        await page.click('[data-section="requests"]');
        await expect(page.locator('#requests')).toHaveClass(/active/);

        // The mock returned "Test Request Query" or "Test Request Text". 
        // gamemaster.js renderRequests usually shows the truncated query or text.
        // Let's expect part of it.
        await expect(page.locator('#requestsFeed')).toContainText('Test Request');
    });

    test('Timer controls functionality', async ({ page }) => {
        await page.goto('/master.html');

        // Login
        await page.fill('#loginPassword', 'admin2025');
        await page.click('button:has-text("Login")');

        // Check initial state
        const timerDisplay = page.locator('#timer');
        await expect(timerDisplay).toContainText('90:00');

        // Start Timer
        await page.click('#startTimer');

        // Wait a bit and check if time changed
        await page.waitForTimeout(1100);
        const timeText = await timerDisplay.textContent();
        expect(timeText).not.toBe('90:00');

        // Pause Timer
        await page.click('#pauseTimer');
        const pausedTime = await timerDisplay.textContent();
        await page.waitForTimeout(1100);
        expect(await timerDisplay.textContent()).toBe(pausedTime); // Should not change

        // Reset Timer
        await page.click('#resetTimer');
        await expect(timerDisplay).toContainText('90:00');
    });

    test('Hard reset functionality', async ({ page }) => {
        await page.goto('/master.html');
        // Login
        await page.fill('#loginPassword', 'admin2025');
        await page.click('button:has-text("Login")');

        // Navigate to Admin/Game Control
        await page.click('[data-section="admin"]');

        // Click Initialize New Game
        await page.click('button:has-text("Initialize New Game")');

        // Expect Modal
        // The modal title or text usually contains "Initialize New Game" or similar.
        // The confirm button has text "Yes, Initialize" (from gamemaster.js logic)
        await expect(page.locator('button:has-text("Yes, Initialize")')).toBeVisible();

        // Click confirm
        await page.click('button:has-text("Yes, Initialize")');

        // The app reloads the page.
        // We verify reload by checking we are back to login overlay or initial state.
        // Note: Page reload in Playwright might disconnect the page context if not handled, 
        // but `page.click` causing navigation usually waits.
        // However, this is `window.location.reload()`.

        await expect(page.locator('#loginOverlay')).toBeVisible({ timeout: 10000 });
    });

    test('Session archiving', async ({ page }) => {
        await page.goto('/master.html');
        // Login
        await page.fill('#loginPassword', 'admin2025');
        await page.click('button:has-text("Login")');

        await page.click('[data-section="sessions"]');

        // Wait for list
        await expect(page.locator('#availableSessionsList')).toContainText('Test Session');

        // Mock the DELETE/Update call for archiving
        await page.route('**/*.supabase.co/rest/v1/sessions*', async route => {
            const method = route.request().method();
            // It uses PATCH to update status to 'archived', OR DELETE if hard delete.
            // deleteSession(..., false) -> PATCH.
            if (method === 'PATCH' || method === 'DELETE') {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify([{ id: 'session-123', status: 'archived' }])
                });
                return;
            }
            // For checking existence (GET with id=eq.X)
            if (method === 'GET' && route.request().url().includes('id=eq.')) {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ id: 'session-123', status: 'active' }) // return object for single()
                });
                return;
            }

            await route.continue();
        });

        // Click Delete on the test session
        await page.click('.session-item button:has-text("Delete")');

        // Confirm Modal
        // deleteSessionPrompt calls showConfirmModal with confirmText: 'Archive'
        const modalArchiveButton = page.locator('.modal-overlay button:has-text("Archive")');
        await expect(modalArchiveButton).toBeVisible();
        await modalArchiveButton.click();

        // Verify Toast message
        // "Session "Test Session" has been archived"
        await expect(page.locator('body')).toContainText('has been archived');
    });

});
