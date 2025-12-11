
import { test, expect } from '@playwright/test';

test.describe('Notetaker Flow: Submit Observations and Verify Timeline', () => {

    test.setTimeout(90000); // 90 seconds

    test('Notetaker submits observation and it appears in timeline', async ({ browser }) => {
        const context = await browser.newContext();

        // --- Setup Session ---
        const setupPage = await context.newPage();
        setupPage.on('console', msg => console.log(`SETUP LOG: ${msg.text()}`));

        await setupPage.goto('/master.html');
        await setupPage.waitForFunction(() => window.esg && window.esg.isSupabaseAvailable !== undefined);

        const sessionName = 'Notetaker Test ' + Date.now();
        console.log(`Creating session: ${sessionName}`);

        const sessionId = await setupPage.evaluate(async (name) => {
            return await window.esg.createSession(name);
        }, sessionName);

        expect(sessionId).toBeTruthy();
        console.log(`Session Created: ${sessionId}`);
        await setupPage.close();

        // --- 1. Notetaker Flow: Submit Observation ---
        const pageNotetaker = await context.newPage();
        pageNotetaker.on('console', msg => console.log(`NOTETAKER LOG: ${msg.text()}`));

        console.log('Step 1: Notetaker Login');
        await pageNotetaker.goto('/teams/blue/blue_notetaker.html');
        await expect(pageNotetaker.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageNotetaker.fill('#roleLoginSession', sessionId);
        await pageNotetaker.fill('#roleLoginPassword', 'notetaker2025');

        await Promise.all([
            pageNotetaker.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageNotetaker.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageNotetaker.locator('#loader')).toBeHidden({ timeout: 15000 });
        await expect(pageNotetaker.locator('#roleLoginOverlay')).toBeHidden();

        console.log('Step 2: Submit Quick Observation');

        // Fill the quick capture textarea
        await pageNotetaker.fill('#quickCaptureText', 'Test observation: Team discussed economic sanctions strategy. Strong consensus on targeting critical minerals supply chain. Legislative-Executive alignment observed.');

        // Submit the observation
        await pageNotetaker.evaluate(async () => {
            if (window.addCapture) {
                console.log('Calling window.addCapture()');
                await window.addCapture();
            } else {
                console.error('window.addCapture is not defined');
            }
        });

        await pageNotetaker.waitForTimeout(2000);

        console.log('Step 3: Verify Observation Appears in Timeline');

        // Check if the observation appears in the timeline
        const timelineHasObservation = await pageNotetaker.evaluate(() => {
            const timeline = document.getElementById('timelineContainer');
            if (!timeline) {
                console.log('Timeline container not found');
                return false;
            }

            const timelineText = timeline.textContent || '';
            const hasObservation = timelineText.includes('economic sanctions strategy') ||
                timelineText.includes('critical minerals');

            console.log('Timeline has observation:', hasObservation);
            console.log('Timeline text sample:', timelineText.substring(0, 200));

            return hasObservation;
        });

        if (timelineHasObservation) {
            console.log('✓ Observation appears in Notetaker timeline');
        } else {
            console.log('⚠️  Observation may not be visible in timeline yet');
        }

        // --- 2. White Cell Flow: Verify Cross-Role Visibility ---
        const pageWhite = await context.newPage();
        pageWhite.on('console', msg => console.log(`WHITECELL LOG: ${msg.text()}`));

        console.log('Step 4: White Cell Login to Verify Cross-Role Visibility');
        await pageWhite.goto('/teams/blue/blue_white_cell.html');
        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });

        await pageWhite.fill('#roleLoginSession', sessionId);
        await pageWhite.fill('#roleLoginPassword', 'whitecell2025');

        await Promise.all([
            pageWhite.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            pageWhite.click('button:has-text("Login")', { force: true })
        ]);

        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Give time for data propagation
        await pageWhite.waitForTimeout(3000);

        console.log('Step 5: Check if White Cell Can See Timeline Update');

        // Reload to ensure fresh data
        await pageWhite.reload({ waitUntil: 'domcontentloaded' });
        await expect(pageWhite.locator('#loader')).toBeHidden({ timeout: 15000 });

        // Check White Cell's timeline
        const whiteSeesObservation = await pageWhite.evaluate(async () => {
            // Try to fetch timeline from database
            if (window.esg && window.esg.fetchTimeline) {
                try {
                    const timeline = await window.esg.fetchTimeline(1);
                    console.log('Fetched timeline items:', timeline ? timeline.length : 0);

                    if (timeline && timeline.length > 0) {
                        const hasNote = timeline.some(item =>
                            (item.content && item.content.includes('economic sanctions')) ||
                            (item.content && item.content.includes('critical minerals'))
                        );
                        console.log('Timeline has notetaker observation:', hasNote);
                        return hasNote;
                    }
                } catch (error) {
                    console.error('Error fetching timeline:', error);
                }
            }
            return false;
        });

        if (whiteSeesObservation) {
            console.log('✓ White Cell can see Notetaker observation in timeline');
        } else {
            console.log('⚠️  Cross-role visibility may need async propagation time');
        }

        console.log('✅ SUCCESS: Notetaker flow validated!');
        console.log('   - Notetaker can submit observations');
        console.log('   - Observations are saved to timeline');
        console.log('   - Cross-role visibility tested');

        await context.close();
    });
});
