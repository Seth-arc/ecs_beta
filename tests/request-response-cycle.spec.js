const { test, expect } = require('@playwright/test');

test('Request-Response Cycle Test', async ({ browser }) => {
    // 1. Setup Context (Shared for LocalStorage communication)
    const context = await browser.newContext();

    // Block Supabase to force LocalStorage mode for reliable testing
    await context.route('**/*supabase*', route => route.abort());

    // Create Pages
    const facilitatorPage = await context.newPage();
    const whiteCellPage = await context.newPage();

    // Use a unique session ID for this test run
    const sessionId = `test-session-${Date.now()}`;

    // Add init scripts to set session/auth state PER PAGE
    await facilitatorPage.addInitScript((sid) => {
        window.sessionStorage.setItem('esg_role', 'blue_facilitator');
        window.sessionStorage.setItem('esg_session_id', sid);
        window.sessionStorage.setItem('esg_client_id', 'client-facilitator');
        window.supabase = undefined;
    }, sessionId);

    await whiteCellPage.addInitScript((sid) => {
        window.sessionStorage.setItem('esg_role', 'blue_whitecell');
        window.sessionStorage.setItem('esg_session_id', sid);
        window.sessionStorage.setItem('esg_client_id', 'client-whitecell');
        window.supabase = undefined;
    }, sessionId);

    whiteCellPage.on('console', msg => console.log(`White Cell Log: ${msg.text()}`));

    // 2. Load Pages
    await facilitatorPage.goto('/teams/blue/blue_facilitator.html');
    await whiteCellPage.goto('/teams/blue/blue_white_cell.html');

    // 3. Define unique request strings
    const timestamp = Date.now();
    // Ensure text is long enough to pass validation (>20 chars)
    const rfi1Text = `RFI-1-Detailed-Request-Text-${timestamp}`;
    const rfi1ResponseTitle = `Response-1-${timestamp}`;
    const rfi1ResponseContent = `Answer-1-${timestamp}`;

    const rfi2Text = `RFI-2-Detailed-Request-Text-${timestamp}`;
    const rfi2ResponseTitle = `Response-2-${timestamp}`;
    const rfi2ResponseContent = `Answer-2-${timestamp}`;

    // 4. Facilitator Action 1: Submit RFI 1
    await test.step('Facilitator submits RFI 1', async () => {
        // Navigate to Info Requests section if not active
        await facilitatorPage.click('.nav-item[data-section="info-requests"]');

        // Fill form
        await facilitatorPage.selectOption('#requestPriority', 'normal');
        await facilitatorPage.click('button.category-checkbox[data-category="trade"]');
        await facilitatorPage.fill('#requestDetails', rfi1Text);

        // Submit
        await facilitatorPage.click('button[onclick="addInfoRequest()"]');

        // Verify in "Pending Requests" list
        await expect(facilitatorPage.locator('#pendingRequests')).toContainText(rfi1Text);
    });

    // 5. White Cell Validation & Response 1
    await test.step('White Cell responds to RFI 1', async () => {
        // Refresh to get data
        await whiteCellPage.reload();

        // Navigate to Requests
        await whiteCellPage.click('.nav-item[data-section="requests"]');

        // Verify RFI 1 is present
        await expect(whiteCellPage.locator('#requestsContainer')).toContainText(rfi1Text);

        // Navigate to Communication to respond
        await whiteCellPage.click('.nav-item[data-section="communication"]');

        // Fill response form
        // Note: We use 'rfi_response' as value based on HTML inspection
        await whiteCellPage.selectOption('#responseType', 'rfi_response');
        await whiteCellPage.fill('#responseTitle', rfi1ResponseTitle);
        await whiteCellPage.fill('#responseContent', rfi1ResponseContent);

        // Send
        await whiteCellPage.click('button[onclick="sendResponseToBlue()"]');

        // Wait for potential toast or processing
        await whiteCellPage.waitForTimeout(1000);
    });

    // 6. Validation of Response 1 (Status Update)
    await test.step('Verify RFI 1 Status Update', async () => {
        // Check White Cell view
        await whiteCellPage.reload(); // Force reload to ensure fresh data



        await whiteCellPage.click('.nav-item[data-section="requests"]');
        const requestItem = whiteCellPage.locator('.action-item', { hasText: rfi1Text });


        // Verify it is marked as Answered (Look for (Answered) text or check styles/DOM if needed)
        // Code renders: ... ${isAnswered ? '(Answered)' : ''} ...
        await expect(requestItem).toContainText('(Answered)', { timeout: 10000 });

        // Verify response content is visible attached to the request
        await expect(requestItem).toContainText(rfi1ResponseContent, { timeout: 10000 });
    });

    // 7. Facilitator Action 2: Submit RFI 2
    await test.step('Facilitator submits RFI 2', async () => {
        // Ensure categories are reset or just select another one
        // The code resets selected class on Submit, so we just pick one
        await facilitatorPage.click('button.category-checkbox[data-category="tech"]');
        await facilitatorPage.selectOption('#requestPriority', 'urgent');
        await facilitatorPage.fill('#requestDetails', rfi2Text);
        await facilitatorPage.click('button[onclick="addInfoRequest()"]');

        await expect(facilitatorPage.locator('#pendingRequests')).toContainText(rfi2Text);
    });

    // 8. White Cell Validation & Response 2
    await test.step('White Cell responds to RFI 2', async () => {
        await whiteCellPage.reload();
        await whiteCellPage.click('.nav-item[data-section="requests"]');
        await expect(whiteCellPage.locator('#requestsContainer')).toContainText(rfi2Text);

        await whiteCellPage.click('.nav-item[data-section="communication"]');
        await whiteCellPage.selectOption('#responseType', 'rfi_response');
        await whiteCellPage.fill('#responseTitle', rfi2ResponseTitle);
        await whiteCellPage.fill('#responseContent', rfi2ResponseContent);
        await whiteCellPage.click('button[onclick="sendResponseToBlue()"]');

        await whiteCellPage.waitForTimeout(1000);
    });

    // 9. Validation of Response 2
    await test.step('Verify RFI 2 Status Update', async () => {
        await whiteCellPage.click('.nav-item[data-section="requests"]');
        const requestItem2 = whiteCellPage.locator('.action-item', { hasText: rfi2Text });
        await expect(requestItem2).toContainText('(Answered)', { timeout: 10000 });
        await expect(requestItem2).toContainText(rfi2ResponseContent, { timeout: 10000 });
    });

    // 10. Facilitator View Validation (Bonus/Completeness)
    // Check if Facilitator sees the responses in the "White Cell Responses" tab
    await test.step('Facilitator sees responses', async () => {
        await facilitatorPage.reload();
        await facilitatorPage.click('.nav-item[data-section="white-responses"]');
        await facilitatorPage.evaluate(() => window.loadWhiteResponses());
        await expect(facilitatorPage.locator('#whiteResponsesContainer')).toContainText(rfi1ResponseTitle);
        await expect(facilitatorPage.locator('#whiteResponsesContainer')).toContainText(rfi2ResponseTitle);
    });

});
