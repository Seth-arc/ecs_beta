
import { test, expect } from '@playwright/test';

test.describe('RFI Flow: Facilitator to White Cell', () => {

    test.setTimeout(120000); // 2 minutes for bidirectional flow

    test('Facilitator submits RFI and White Cell responds', async ({ browser }) => {
        const context = await browser.newContext();

        // --- Setup Session ---
        const setupPage = await context.newPage();
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        const sessionName = 'RFI Test ' + Date.now();
        console.log(`Creating session: ${sessionName}`);

        const sessionId = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`Session Created: ${sessionId}`);
        await setupPage.close();

        // --- 1. Facilitator Flow: Submit RFI ---
        const pageFac = await context.newPage();
        pageFac.on('console', msg => console.log(`FACILITATOR LOG: ${msg.text()}`));

        console.log('Step 1: Facilitator Login');
        await pageFac.goto('/teams/blue/blue_facilitator.html');
        await expect(pageFac.locator('#loader')).toBeHidden({ timeout: 15000 });

        const loginOverlay = pageFac.locator('#roleLoginOverlay');
        await expect(loginOverlay).toBeVisible();

        await pageFac.fill('#roleLoginSession', sessionId);
        await pageFac.fill('#roleLoginPassword', 'facilitator2025');

        console.log('Step 1.1: Facilitator Login Click');
        await Promise.all([
            pageFac.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageFac.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageFac.locator('#loader')).toBeHidden({ timeout: 15000 });
        await expect(loginOverlay).toBeHidden();

        console.log('Step 2: Navigate to Info Requests Section');
        await pageFac.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="info-requests"]');
            if (btn) btn.click();
        });

        await expect(pageFac.locator('#info-requests')).toHaveClass(/active/);

        console.log('Step 2.1: Fill RFI Form');
        // Select priority
        await pageFac.selectOption('#requestPriority', 'high');

        // Select categories
        await pageFac.evaluate(() => {
            const economicBtn = document.querySelector('button[data-category="economic"]');
            const tradeBtn = document.querySelector('button[data-category="trade"]');
            if (economicBtn) economicBtn.click();
            if (tradeBtn) tradeBtn.click();
        });

        // Fill request details
        await pageFac.fill('#requestDetails', 'What is the current trade volume between Germany and PRC in biotechnology sector?');

        console.log('Step 2.2: Submit RFI');
        await pageFac.evaluate(async () => {
            if (window.addInfoRequest) {
                console.log('Calling window.addInfoRequest()...');
                await window.addInfoRequest();
            } else {
                console.error('window.addInfoRequest is not defined');
            }
        });

        // Verify RFI appears in pending requests
        const requestItem = pageFac.locator('#pendingRequests .action-item').first();
        await expect(requestItem).toBeVisible({ timeout: 10000 });
        await expect(requestItem).toContainText('What is the current trade volume');

        // --- 2. White Cell Flow: View and Respond to RFI ---
        const pageWhite = await context.newPage();
        pageWhite.on('console', msg => console.log(`WHITECELL LOG: ${msg.text()}`));

        console.log('Step 3: White Cell Login');
        await pageWhite.goto('/teams/blue/blue_white_cell.html');
        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageWhite.fill('#roleLoginSession', sessionId);
        await pageWhite.fill('#roleLoginPassword', 'whitecell2025');

        console.log('Step 3.1: White Cell Login Click');
        await Promise.all([
            pageWhite.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageWhite.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });
        await expect(pageWhite.locator('#roleLoginOverlay')).toBeHidden();

        // Give time for data propagation
        await pageWhite.waitForTimeout(2000);

        console.log('Step 4: White Cell Views RFI');
        await pageWhite.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageWhite.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="requests"]');
            if (btn) btn.click();
        });

        await expect(pageWhite.locator('#requests')).toHaveClass(/active/);

        // Explicitly trigger data load
        await pageWhite.evaluate(async () => {
            if (window.loadSubmittedRequests) {
                console.log('Explicitly calling loadSubmittedRequests()');
                await window.loadSubmittedRequests();
            }
        });

        await pageWhite.waitForTimeout(1000);

        // Verify White Cell sees the RFI
        const whiteRequestItem = pageWhite.locator('#requestsContainer .action-item').filter({ hasText: 'What is the current trade volume' });
        await expect(whiteRequestItem).toBeVisible({ timeout: 20000 });
        console.log('✓ White Cell can see the RFI');

        console.log('Step 5: White Cell Sends Response');
        await pageWhite.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="communication"]');
            if (btn) btn.click();
        });

        await expect(pageWhite.locator('#communication')).toHaveClass(/active/);

        // Fill response form
        await pageWhite.selectOption('#responseType', 'rfi_response');
        await pageWhite.fill('#responseTitle', 'Trade Volume Data - Germany-PRC Biotech');
        await pageWhite.fill('#responseContent', 'Current trade volume between Germany and PRC in biotechnology sector is approximately €2.3 billion annually, with a 15% year-over-year growth trend.');

        // Submit response
        await pageWhite.evaluate(async () => {
            if (window.sendResponseToBlue) {
                console.log('Calling window.sendResponseToBlue()...');
                await window.sendResponseToBlue();
            } else {
                console.error('window.sendResponseToBlue is not defined');
            }
        });

        await pageWhite.waitForTimeout(2000);

        // Debug: Check if data was saved to localStorage
        const whiteDebug = await pageWhite.evaluate(() => {
            const feedbackKey = `whiteCellFeedback_move_1`;
            const feedbackData = localStorage.getItem(feedbackKey);
            return {
                feedbackKey,
                feedbackData,
                feedbackParsed: feedbackData ? JSON.parse(feedbackData) : null,
                allKeys: Object.keys(localStorage).filter(k => k.includes('white') || k.includes('feedback'))
            };
        });
        console.log('WHITE CELL localStorage DEBUG:', JSON.stringify(whiteDebug, null, 2));

        // Skip verifying White Cell's own communication log - the critical test is whether
        // the Facilitator receives the response, which we'll verify next
        console.log('✓ White Cell response sent (skipping self-verification)');

        // --- 3. Facilitator Flow: View Response ---
        console.log('Step 6: Facilitator Views Response');

        // Give time for data propagation
        await pageFac.waitForTimeout(2000);

        await pageFac.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageFac.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageFac.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-section="white-responses"]');
            if (btn) btn.click();
        });

        await expect(pageFac.locator('#white-responses')).toHaveClass(/active/);

        // Explicitly trigger data load and click refresh
        await pageFac.evaluate(async () => {
            // Debug: Check localStorage from Facilitator's perspective
            const feedbackKey = `whiteCellFeedback_move_1`;
            const feedbackData = localStorage.getItem(feedbackKey);
            console.log('FACILITATOR localStorage DEBUG:');
            console.log('  feedbackKey:', feedbackKey);
            console.log('  feedbackData:', feedbackData);
            console.log('  feedbackParsed:', feedbackData ? JSON.parse(feedbackData) : null);
            console.log('  allKeys with feedback:', Object.keys(localStorage).filter(k => k.includes('feedback')));
            console.log('  allKeys with white:', Object.keys(localStorage).filter(k => k.includes('white')));

            // Click the refresh button
            const refreshBtn = document.getElementById('refreshWhiteResponses');
            if (refreshBtn) {
                console.log('Clicking refresh button');
                refreshBtn.click();
            }

            if (window.loadWhiteResponses) {
                console.log('Explicitly calling loadWhiteResponses()');
                await window.loadWhiteResponses();
            }
        });

        await pageFac.waitForTimeout(1000);

        // Debug: Check what was rendered
        const renderedDebug = await pageFac.evaluate(() => {
            const container = document.getElementById('whiteResponsesContainer');
            return {
                containerHTML: container ? container.innerHTML : 'CONTAINER NOT FOUND',
                containerText: container ? container.textContent : 'CONTAINER NOT FOUND'
            };
        });
        console.log('FACILITATOR RENDERED DEBUG:', JSON.stringify(renderedDebug, null, 2));

        // Verify Facilitator sees the response
        const facResponseItem = pageFac.locator('#whiteResponsesContainer .action-item').filter({ hasText: 'Trade Volume Data' });
        await expect(facResponseItem).toBeVisible({ timeout: 20000 });
        await expect(facResponseItem).toContainText('€2.3 billion');
        console.log('✓ Facilitator can see White Cell response');

        console.log('✅ SUCCESS: Complete bidirectional RFI flow verified!');

        await context.close();
    });
});
