// Session migration removed; using move-only state

// Move epochs mapping
const moveEpochs = {
    1: 'Epoch 1 (2027-2030)',
    2: 'Epoch 2 (2030-2032)',
    3: 'Epoch 3 (2032-2034)'
};

// Use shared showToast from data-layer.js

// Ensure currentMove is defined before any usage
let currentMove = parseInt(document.getElementById('moveSelector')?.value || '1');

// Check if database is available
const hasUtil = typeof window.esg !== 'undefined';
const currentSessionId = sessionStorage.getItem('esg_session_id');

function getSharedGameStateKey() {
    return (window.STORAGE_KEYS && STORAGE_KEYS.sharedState) || 'sharedGameState';
}
function getWhiteCellKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'whitecell')) || `whiteCell_move_${move}`;
}

function getFacilitatorSubmissionKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'facilitatorSubmission')) || `blueActions_move_${move}`;
}

function getRequestsKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'requests')) || `blueRequests_move_${move}`;
}

function saveGameState() {
    const gameState = {
        move: currentMove,
        phase: currentPhase,
        sessionId: getSessionId(),
        lastUpdate: Date.now()
    };
    safeSetItem(getSharedGameStateKey(), gameState);

    // Push to database if available
    if (hasUtil && window.esg && window.esg.updateGameState) {
        window.esg.updateGameState({
            move: currentMove,
            phase: currentPhase
        }).catch(err => console.error('Error pushing game state:', err));
    }

    // Dispatch custom event for same-window listeners (storage events only fire in other windows)
    window.dispatchEvent(new CustomEvent('gameStateUpdated', { detail: gameState }));
}

let isChangingMove = false; // Flag to prevent re-entrant calls

function changeMoveContext() {
    if (isChangingMove) {
        console.log('Already changing move, ignoring duplicate call');
        return; // Prevent re-entrant calls
    }

    isChangingMove = true;
    try {
        currentMove = parseInt(document.getElementById('moveSelector').value);
        document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];

        const currentData = safeGetItem(getWhiteCellKey(), null);
        if (currentData) {
            loadData();
        } else {
            document.querySelectorAll('input, textarea, select').forEach(el => {
                if (el.id && el.id !== 'moveSelector') el.value = '';
            });
            timelineItems = [];
            updateTimeline();
            updateBadges();
        }

        // Save game state AFTER loading data to ensure the new move is persisted
        saveGameState();
    } finally {
        isChangingMove = false;
    }
}
window.changeMoveContext = changeMoveContext;

// Phase Management
let currentPhase = 1;
let currentFaction = null;

const phaseGuidance = {
    1: "Phase 1: Internal Deliberation (30-40 min) — Monitor all teams' internal discussions and strategic decisions",
    2: "Phase 2: Alliance Consultation (20-30 min) — Track cross-team interactions and alliance negotiations",
    3: "Phase 3: Finalization (10-15 min) — Capture final action decisions from all teams",
    4: "Phase 4: Adjudication (15-20 min) — Process submissions and determine outcomes",
    5: "Phase 5: Results Brief (10-15 min) — Deliver outcomes and capture team reactions"
};

function updatePhaseGuidance() {
    const container = document.getElementById('phaseGuidanceContainer');
    container.innerHTML = `
                <div class="phase-guidance">
                    <strong>Current Phase ${currentPhase}</strong>
                    ${phaseGuidance[currentPhase]}
                </div>
            `;
}

let isChangingPhase = false; // Flag to prevent re-entrant calls

document.querySelectorAll('.phase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isChangingPhase) {
            console.log('Already changing phase, ignoring duplicate call');
            return;
        }

        isChangingPhase = true;
        try {
            document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPhase = parseInt(btn.getAttribute('data-phase'));
            updatePhaseGuidance();
            saveGameState(); // Save to shared storage
        } finally {
            isChangingPhase = false;
        }
    });
});

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const sectionId = item.getAttribute('data-section');
        document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');

        if (sectionId === 'requests') loadSubmittedRequests();
        if (sectionId === 'actions') {
            loadSubmittedActions();
            populateActionSelector();
        }
        if (sectionId === 'adjudication') {
            populateActionSelector();
            displayRulingLog();
        }
        if (sectionId === 'timeline') updateTimeline();
        if (sectionId === 'communication') displayCommunicationLog();
    });
});

// Faction tagging
document.querySelectorAll('.faction-tag').forEach(btn => {
    btn.addEventListener('click', () => {
        if (currentFaction === btn.getAttribute('data-faction')) {
            btn.classList.remove('selected');
            currentFaction = null;
        } else {
            document.querySelectorAll('.faction-tag').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentFaction = btn.getAttribute('data-faction');
        }
    });
});

// Simulation phase markers
document.querySelectorAll('.debate-marker').forEach(btn => {
    btn.addEventListener('click', () => {
        const marker = btn.getAttribute('data-marker');
        const markers = {
            'started': '[PHASE STARTED]',
            'shifted': '[TEAM INTERACTION]',
            'actions': '[ADJUDICATION NEEDED]',
            'consensus': '[RULING MADE]'
        };
        const textarea = document.getElementById('quickCaptureText');
        textarea.value = markers[marker] + ' ' + textarea.value;
    });
});

// Quick templates
function insertTemplate(type) {
    const templates = {
        'disagree': `TEAM CONFLICT
• Team A: ___
• Team B: ___
• Conflict Type: ___
• Adjudication Needed: ___`,

        'consensus': `CROSS-TEAM COORDINATION
• Teams Involved: ___
• Coordination Type: ___
• Effectiveness: ___
• Impact: ___`,

        'question': `CLARIFICATION REQUESTED
• Team: ___
• Question: "___"
• Ruling Provided: ___
• Impact: ___`,

        'concern': `GAME BALANCE ISSUE
• Issue: ___
• Team(s) Affected: ___
• Assessment: ___
• Action Taken: ___`,

        'requestinfo': `RULING/OUTCOME
• Team(s): ___
• Action Being Adjudicated: ___
• Ruling: ___
• Rationale: ___
• Impact on decision: ___`
    };
    const textarea = document.getElementById('quickCaptureText');
    textarea.value = templates[type];
    textarea.focus();
    setTimeout(() => {
        const firstBlank = textarea.value.indexOf('___');
        if (firstBlank !== -1) {
            textarea.setSelectionRange(firstBlank, firstBlank + 3);
        }
    }, 10);
}

// Timer - White Cell controls, shared with other interfaces
let timerSeconds = 90 * 60;
let timerInterval = null;
let timerRunning = false;

function getSharedTimerKey() {
    return (window.STORAGE_KEYS && STORAGE_KEYS.sharedTimer) || 'sharedTimer';
}

function saveTimerState() {
    const timerState = {
        seconds: timerSeconds,
        running: timerRunning,
        lastUpdate: Date.now()
    };
    safeSetItem(getSharedTimerKey(), timerState);

    // Push to Supabase if available
    if (hasUtil && window.esg && window.esg.updateGameState) {
        window.esg.updateGameState({
            timer: timerState
        }).catch(err => console.error('Error pushing timer state:', err));
    }
}

function updateTimer() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    const timerEl = document.getElementById('timer');
    if (timerEl) {
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        timerEl.classList.remove('warning', 'critical');
        if (timerSeconds <= 300 && timerSeconds > 60) {
            timerEl.classList.add('warning');
        } else if (timerSeconds <= 60) {
            timerEl.classList.add('critical');
        }
    }

    // Save state to shared storage
    saveTimerState();
}

// Load initial timer state from shared storage
function loadTimerState() {
    const timerState = safeGetItem(getSharedTimerKey(), null);
    if (timerState) {
        timerSeconds = timerState.seconds || 90 * 60;
        timerRunning = timerState.running || false;
        updateTimer();

        // If timer was running, calculate elapsed time and continue
        // Add maximum elapsed time cap (e.g., 24 hours) to prevent incorrect time if page was closed for extended period
        const MAX_ELAPSED_SECONDS = 24 * 60 * 60; // 24 hours
        if (timerRunning && timerState.lastUpdate) {
            const elapsed = Math.floor((Date.now() - timerState.lastUpdate) / 1000);
            const cappedElapsed = Math.min(elapsed, MAX_ELAPSED_SECONDS);
            timerSeconds = Math.max(0, timerSeconds - cappedElapsed);

            // If elapsed time exceeds cap, reset timer instead of showing incorrect time
            if (elapsed > MAX_ELAPSED_SECONDS) {
                console.warn('Timer was paused for more than 24 hours. Resetting timer.');
                timerSeconds = 90 * 60;
                timerRunning = false;
                showToast('Timer was reset due to extended pause');
            }

            if (timerSeconds > 0 && timerRunning) {
                startTimerInterval();
            } else {
                timerRunning = false;
                saveTimerState();
            }
        }
    }
}

function startTimerInterval() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimer();
        } else {
            clearInterval(timerInterval);
            timerRunning = false;
            saveTimerState();
        }
    }, 1000);
}

document.getElementById('startTimer').addEventListener('click', () => {
    if (!timerRunning) {
        timerRunning = true;
        startTimerInterval();
    }
});

document.getElementById('pauseTimer').addEventListener('click', () => {
    if (timerRunning) {
        clearInterval(timerInterval);
        timerRunning = false;
        saveTimerState();
    }
});

document.getElementById('resetTimer').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerRunning = false;
    timerSeconds = 90 * 60;
    updateTimer();
});

// Load timer state on page load
loadTimerState();

// Capture Type Tabs
let currentCaptureType = 'note';
const hints = {
    note: 'Cross-team dynamics, rule clarifications, fairness observations, game state...',
    moment: 'Critical adjudication moments, major team decisions, turning points...',
    quote: 'Important statements from teams - include context and impact',
    requestinfo: 'Rulings made, clarifications provided, outcome determinations...'
};

document.querySelectorAll('.capture-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.capture-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCaptureType = tab.getAttribute('data-type');
        document.getElementById('captureHint').textContent = hints[currentCaptureType];

        const placeholders = {
            note: 'Type what you\'re observing right now...',
            moment: 'Describe this critical moment...',
            quote: '"Quote text here" - Speaker Name (context about why this matters)',
            requestinfo: 'Question: ___ | Asked by: ___ | Response: ___'
        };
        document.getElementById('quickCaptureText').placeholder = placeholders[currentCaptureType];
    };
});

// Timeline
let timelineItems = [];

async function addCapture() {
    const text = document.getElementById('quickCaptureText').value.trim();
    if (text) {
        let content = text;
        if (currentFaction) {
            const factionLabels = {
                'blue': 'BLUE',
                'green': 'GREEN',
                'red': 'RED',
                'cross': 'Cross-Team'
            };
            content = `[${factionLabels[currentFaction]}] ${text}`;
        }
        const item = {
            type: currentCaptureType,
            time: new Date().toLocaleTimeString(),
            content: content,
            timestamp: Date.now(),
            phase: currentPhase,
            faction: currentFaction,
            team: 'WHITE',
            move: currentMove
        };
        timelineItems.push(item);

        // HIGH-2: Log participant activity
        if (hasUtil && currentSessionId && window.researchTracking && window.researchTracking.logParticipantActivity) {
            await window.researchTracking.logParticipantActivity(
                currentSessionId,
                window.esg.getClientId(),
                'observation_added',
                { type: currentCaptureType, faction: currentFaction }
            );
        }

        document.getElementById('quickCaptureText').value = '';
        updateTimeline();
        updateBadges();
        saveData();
    }
}

// Allow Enter to submit (Shift+Enter for new line)
document.getElementById('quickCaptureText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addCapture();
    }
});

function deduplicateTimelineItems(items) {
    if (!Array.isArray(items)) return [];

    const uniqueItems = [];
    const seenContent = new Set();

    // Sort by timestamp descending first to keep the newest version of similar items
    const sorted = [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    for (const item of sorted) {
        // Create a unique key based on content and team
        // We use a lenient time check (ignoring time) or just content+team to avoiding duplicates 
        // that might be re-fetched multiple times
        // If content is identical and team is identical, we treat it as duplicate
        const key = `${item.content}|${item.team}`;

        if (!seenContent.has(key)) {
            seenContent.add(key);
            uniqueItems.push(item);
        }
    }

    return uniqueItems;
}

async function updateTimeline() {
    // Hotfix: Filter out persistent phantom data
    timelineItems = timelineItems.filter(item =>
        !item.content || !item.content.includes('What is the current trade level between Germany and the PRC')
    );
    const allTimelineItems = [...timelineItems];

    // Load timeline items from database if available
    if (hasUtil && currentSessionId) {
        try {
            const dbTimeline = await window.esg.fetchTimeline(currentMove);
            if (dbTimeline && Array.isArray(dbTimeline)) {
                // Map database timeline items to local format
                const mappedItems = dbTimeline.map(item => ({
                    type: item.type || 'moment',
                    time: new Date(item.created_at || item.timestamp).toLocaleTimeString(),
                    timestamp: new Date(item.created_at || item.timestamp).getTime(),
                    phase: item.phase || currentPhase,
                    content: item.content || '',
                    team: item.team || 'blue',
                    title: item.title || item.content?.substring(0, 50) || 'Timeline Item',
                    metadata: item.metadata || {}
                }));
                allTimelineItems.push(...mappedItems);
            }
        } catch (error) {
            console.error('Error loading timeline from database:', error);
            // Fall through to localStorage fallback
        }
    }

    // Load BLUE team timeline items from facilitator/notetaker (localStorage fallback)
    try {
        const blueKey = `whiteCell_move_${currentMove}`;
        const blueData = safeGetItem(blueKey, {});
        if (blueData.timelineItems && Array.isArray(blueData.timelineItems)) {
            // Filter for BLUE team items and add to timeline
            const blueTeamItems = blueData.timelineItems.filter(item =>
                item.team === 'blue' || item.team === 'BLUE'
            );
            allTimelineItems.push(...blueTeamItems);
        }

        // Also check for notetaker timeline items
        const notesKey = `notes_move_${currentMove}`;
        const notesData = safeGetItem(notesKey, {});
        if (notesData.timelineItems && Array.isArray(notesData.timelineItems)) {
            // Map notetaker items to timeline format
            const mappedItems = notesData.timelineItems.map(item => ({
                ...item,
                team: 'blue',
                time: item.time || new Date().toLocaleTimeString(),
                timestamp: item.timestamp || Date.now()
            }));
            allTimelineItems.push(...mappedItems);
        }

        // Also check for submitted notetaker notes
        const notesSubmissionKey = `blueNotesSubmission_move_${currentMove}`;
        const notesSubmission = safeGetItem(notesSubmissionKey, null);
        if (notesSubmission && notesSubmission.submitted) {
            // Add submission marker to timeline
            allTimelineItems.push({
                type: 'submission',
                time: new Date(notesSubmission.submittedAt || Date.now()).toLocaleTimeString(),
                timestamp: new Date(notesSubmission.submittedAt || Date.now()).getTime(),
                phase: notesSubmission.phase || currentPhase,
                content: `Notetaker submitted notes (${notesSubmission.timelineItems?.length || 0} timeline items)`,
                team: 'blue',
                title: 'Notetaker Submission'
            });
        }
    } catch (e) {
        console.error('Error loading BLUE timeline:', e);
        showToast('Error loading timeline data');
    }

    // Deduplicate timeline items
    const filteredItems = allTimelineItems.filter(item =>
        !item.content || !item.content.includes('What is the current trade level between Germany and the PRC')
    );
    const deduplicatedItems = deduplicateTimelineItems(filteredItems);

    // Separate items by team
    const blueItems = deduplicatedItems.filter(item =>
        item.team === 'blue' || item.team === 'BLUE'
    );
    const greenItems = deduplicatedItems.filter(item =>
        item.team === 'green' || item.team === 'GREEN'
    );
    const redItems = deduplicatedItems.filter(item =>
        item.team === 'red' || item.team === 'RED'
    );

    // Update counts
    document.getElementById('blueTimelineCount').textContent = `${blueItems.length} item${blueItems.length !== 1 ? 's' : ''}`;
    document.getElementById('greenTimelineCount').textContent = `${greenItems.length} item${greenItems.length !== 1 ? 's' : ''}`;
    document.getElementById('redTimelineCount').textContent = `${redItems.length} item${redItems.length !== 1 ? 's' : ''}`;

    // Render each team's timeline
    renderTeamTimeline('blueTimeline', blueItems, 'BLUE');
    renderTeamTimeline('greenTimeline', greenItems, 'GREEN');
    renderTeamTimeline('redTimeline', redItems, 'RED');
}

function renderTeamTimeline(containerId, items, team) {
    const container = document.getElementById(containerId);
    const teamColor = getTeamColor(team);

    // Clear existing content
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No ${team} team items yet</p></div>`;
    } else {
        // Sort items in reverse chronological order
        const sortedItems = items.slice().reverse();

        sortedItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'timeline-item';
            itemDiv.style.margin = '0';
            itemDiv.style.borderRadius = '0';
            itemDiv.style.borderBottom = '1px solid var(--color-border)';
            itemDiv.style.borderLeft = `3px solid ${teamColor}`;

            const typeLabel = item.type === 'note' ? 'Note' :
                item.type === 'moment' ? 'Moment' :
                    item.type === 'quote' ? 'Quote' :
                        item.type === 'white_feedback' ? 'White Cell Feedback' :
                            item.type === 'requestinfo' ? 'Info Request' :
                                item.type === 'action' ? 'Action' :
                                    (item.type || 'Info');

            let contentHtml = item.content;
            if (item.type === 'white_feedback') {
                contentHtml = `
                    <strong>From:</strong> WHITE Cell<br>
                    <strong>To:</strong> ${team}<br>
                    <strong>Title:</strong> ${item.title || 'Feedback'}<br>
                    <strong>Message:</strong> ${item.content}
                `;
            } else if (item.type === 'requestinfo') {
                contentHtml = `
                    <strong>From:</strong> ${team}<br>
                    <strong>To:</strong> WHITE Cell<br>
                    <strong>Request:</strong> ${item.content}
                `;
            }

            itemDiv.innerHTML = `
                        <div class="timeline-header">
                            <span class="timeline-time">${item.time}</span>
                            <span class="timeline-type ${item.type}">${typeLabel}</span>
                        </div>
                        <div class="timeline-content">${contentHtml}</div>
                    `;

            container.appendChild(itemDiv);
        });
    }
}

function getTeamColor(team) {
    const colors = {
        'BLUE': 'var(--color-team-blue)',
        'GREEN': 'var(--color-team-green)',
        'RED': 'var(--color-team-red)'
    };
    return colors[team] || 'var(--color-border)';
}

function updateBadges() {
    let totalTimelineItems = timelineItems.filter(i => i.team !== 'WHITE').length;

    const blueSubmitted = localStorage.getItem(`blueMove${currentMove}Submitted`);
    if (blueSubmitted) {
        const blueData = JSON.parse(blueSubmitted);
        totalTimelineItems += blueData.timelineItems?.length || 0;
    }

    const greenSubmitted = localStorage.getItem(`greenMove${currentMove}Submitted`);
    if (greenSubmitted) {
        const greenData = JSON.parse(greenSubmitted);
        totalTimelineItems += greenData.timelineItems?.length || 0;
    }

    const redSubmitted = localStorage.getItem(`redMove${currentMove}Submitted`);
    if (redSubmitted) {
        const redData = JSON.parse(redSubmitted);
        totalTimelineItems += redData.timelineItems?.length || 0;
    }

    document.getElementById('timelineBadge').textContent = totalTimelineItems;

    const requestsData = safeGetItem(getRequestsKey(), null)
        || safeGetItem(`blueRequests_session_${getSessionId()}_move_${currentMove}`, null)
        || safeGetItem(`blueRequestsSubmittedMove${currentMove}`, null);
    let requestCount = 0;
    if (requestsData) {
        requestCount = Array.isArray(requestsData) ? requestsData.length : (requestsData.requests?.length || 0);
    }
    document.getElementById('requestsBadge').textContent = requestCount;

    const actionsSubmission = safeGetItem(getFacilitatorSubmissionKey(), null)
        || safeGetItem((window.buildMoveKey && buildMoveKey(currentMove, 'facilitator')) || `actions_move_${currentMove}`, null)
        || safeGetItem(`blueActionsSubmittedMove${currentMove}`, null);
    const actionCount = actionsSubmission && actionsSubmission.actions ? (actionsSubmission.actions.length || 0) : 0;
    document.getElementById('actionsBadge').textContent = actionCount;

    // Count rulings (move-only)
    const rulingsKey = `whiteCellRulings_move_${currentMove}`;
    let rulings = [];
    try {
        const stored = localStorage.getItem(rulingsKey) || localStorage.getItem('whiteCellRulings') || '[]';
        rulings = JSON.parse(stored);
    } catch (e) {
        console.error('Error loading rulings for badge:', e);
        rulings = [];
    }
    document.getElementById('adjudicationBadge').textContent = rulings.length;

    // Count communications (move-only)
    const commKey = `communications_move_${currentMove}`;
    let commLocal = [];
    try {
        const stored = safeGetItem(commKey, []);
        commLocal = Array.isArray(stored) ? stored : [];
    } catch (e) {
        console.error('Error loading communications for badge:', e);
        commLocal = [];
    }
    const commCount = commLocal.length;
    document.getElementById('communicationBadge').textContent = commCount;
}

async function loadSubmittedRequests() {
    const container = document.getElementById('requestsContainer');

    let requests = [];

    // Try to load from database first
    const activeSessionId = currentSessionId || (window.esg && window.esg.getCurrentSessionId ? window.esg.getCurrentSessionId() : null);
    if (hasUtil && activeSessionId) {
        try {
            const dbRequests = await window.esg.fetchRequests(activeSessionId);
            if (dbRequests && Array.isArray(dbRequests)) {
                requests = dbRequests.filter(r => r.phase === currentPhase || !r.phase);
            }
        } catch (error) {
            console.error('Error loading requests from database:', error);
            // Fall through to localStorage fallback
        }
    }

    // Fallback to localStorage if database not available or empty
    if (requests.length === 0) {
        // Use move-only key, then fallback to legacy keys
        let requestsData = safeGetItem(getRequestsKey(), null);
        if (!requestsData) {
            requestsData = safeGetItem(`blueRequestsSubmittedMove${currentMove}`, null);
        }

        if (requestsData) {
            try {
                // Handle both array and object formats
                if (Array.isArray(requestsData)) {
                    requests = requestsData;
                } else if (typeof requestsData === 'object' && requestsData !== null) {
                    requests = requestsData.requests || [];
                }
            } catch (e) {
                console.error('Error parsing requests data:', e);
                container.innerHTML = `
                            <div class="empty-state">
                                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                                </svg>
                                <p>Error loading requests</p>
                                <p>Data may be corrupted</p>
                            </div>
                        `;
                return;
            }
        }
    }

    if (requests.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        <p>No requests for information yet</p>
                        <p>Requests will appear here when submitted</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = requests.map(request => {
        const isAnswered = request.status === 'answered' || request.response;
        return `
                <div class="action-item" style="${isAnswered ? 'opacity: 0.7;' : ''}">
                    <div class="action-header">
                        <span class="action-number">Info Request</span>
                        <span style="font-size: 0.6875rem; color: var(--color-text-muted);">${(request.categories || []).join(', ')} - ${(request.priority || '').toString().toUpperCase()} ${isAnswered ? '(Answered)' : ''}</span>
                    </div>
                    <div style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 8px;">${request.details || request.text || request.query || ''}</div>
                    ${request.response ? `<div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 8px; padding: 8px; background: #f8fafc; border-radius: 4px;"><strong>Response:</strong> ${request.response}</div>` : ''}
                    <div style="font-size: 0.75rem; color: var(--color-text-muted);">
                        Submitted: ${new Date(request.timestamp || request.created_at || Date.now()).toLocaleString()}
                    </div>
                </div>
            `;
    }).join('');
}

async function loadSubmittedActions() {
    const container = document.getElementById('actionsContainer');

    let actions = [];

    // Try to load from database first
    const activeSessionId = currentSessionId || (window.esg && window.esg.getCurrentSessionId ? window.esg.getCurrentSessionId() : null);
    if (hasUtil && activeSessionId) {
        console.log(`DEBUG: loadSubmittedActions - Session: ${activeSessionId}, Move: ${currentMove}`);
        try {
            const dbActions = await window.esg.fetchActions(currentMove, activeSessionId);
            console.log(`DEBUG: loadSubmittedActions - fetch result count: ${dbActions ? dbActions.length : 'null'}`);
            if (dbActions && Array.isArray(dbActions)) {
                actions = dbActions;
            }
        } catch (error) {
            console.error('Error loading actions from database:', error);
            // Fall through to localStorage fallback
        }
    }

    // Fallback to localStorage if database not available or empty
    if (actions.length === 0) {
        // Try unified keys first, then fall back to legacy storage
        let submission = safeGetItem(getFacilitatorSubmissionKey(), null);
        if (!submission) {
            submission = safeGetItem((window.buildMoveKey && buildMoveKey(currentMove, 'facilitator')) || `actions_move_${currentMove}`, null);
        }
        if (!submission) {
            submission = safeGetItem(`blueActionsSubmittedMove${currentMove}`, null);
        }

        if (submission) {
            actions = Array.isArray(submission.actions) ? submission.actions : [];
        }
    }

    // Also populate action selector dropdown
    populateActionSelector();

    if (actions.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        <p>No actions submitted yet</p>
                        <p>Actions will appear here when submitted</p>
                    </div>
                `;
        return;
    }

    if (actions.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        <p>No actions submitted yet</p>
                        <p>Actions will appear here when submitted</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = actions.map((action, index) => {
        const actionId = action.id || action.number || `action-${index}`;
        const mechanismNames = {
            'sanctions': 'Sanctions/Financial Restrictions',
            'export': 'Export Controls',
            'investment': 'Investment / Capital Controls',
            'trade': 'Trade Policy',
            'financial': 'Financial/ Digital Asset Policy',
            'economic': 'General Economic Statecraft/Cross-Cutting Tools',
            'industrial': 'Industrial Policy',
            'infrastructure': 'Infrastructure & Workforce Development/Supply-Chain Resilience'
        };
        const sectorNames = {
            'biotechnology': 'Biotechnology',
            'agriculture': 'Agriculture',
            'telecommunications': 'Telecommunications'
        };
        return `
                <div class="action-item" data-action-id="${actionId}">
                    <div class="action-header">
                        <span class="action-number">Action ${action.number || index + 1}</span>
                        <span style="font-size: 0.6875rem; color: var(--color-text-muted);">${mechanismNames[action.mechanism] || action.mechanism || ''} - ${sectorNames[action.sector] || action.sector || ''}</span>
                    </div>
                    <div style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 8px;"><strong>Goal:</strong> ${action.goal || ''}</div>
                    <div style="font-size: 0.75rem; color: var(--color-text-muted);">
                        Submitted: ${new Date(action.submitted_at || action.created_at || action.timestamp || Date.now()).toLocaleString()}
                    </div>
                </div>
            `;
    }).join('');
}

async function populateActionSelector() {
    const selector = document.getElementById('adj-action-selector');
    if (!selector) return;

    // Clear existing options except the first one
    selector.innerHTML = '<option value="">-- Select an action to adjudicate --</option>';

    let actions = [];

    // Try to load from database first
    const activeSessionId = currentSessionId || (window.esg && window.esg.getCurrentSessionId ? window.esg.getCurrentSessionId() : null);
    if (hasUtil && activeSessionId) {
        try {
            const dbActions = await window.esg.fetchActions(currentMove, activeSessionId);
            if (dbActions && Array.isArray(dbActions)) {
                actions = dbActions;
            }
        } catch (error) {
            console.error('Error loading actions from database for selector:', error);
            // Fall through to localStorage fallback
        }
    }

    // Fallback to localStorage if database not available or empty
    if (actions.length === 0) {
        let submission = safeGetItem(getFacilitatorSubmissionKey(), null);
        if (!submission) {
            submission = safeGetItem((window.buildMoveKey && buildMoveKey(currentMove, 'facilitator')) || `actions_move_${currentMove}`, null);
        }
        if (!submission) {
            submission = safeGetItem(`blueActionsSubmittedMove${currentMove}`, null);
        }

        if (submission) {
            actions = Array.isArray(submission.actions) ? submission.actions : [];
        }
    }

    if (actions.length === 0) return;

    actions.forEach((action, index) => {
        const actionId = action.id || action.number || `action-${index}`;
        const mechanismNames = {
            'sanctions': 'Sanctions/Financial Restrictions',
            'export': 'Export Controls',
            'investment': 'Investment / Capital Controls',
            'trade': 'Trade Policy',
            'financial': 'Financial/ Digital Asset Policy',
            'economic': 'General Economic Statecraft/Cross-Cutting Tools',
            'industrial': 'Industrial Policy',
            'infrastructure': 'Infrastructure & Workforce Development/Supply-Chain Resilience'
        };
        const sectorNames = {
            'biotechnology': 'Biotechnology',
            'agriculture': 'Agriculture',
            'telecommunications': 'Telecommunications'
        };
        let label = `Action ${action.number || index + 1}: ${mechanismNames[action.mechanism] || action.mechanism || 'Unknown'} - ${sectorNames[action.sector] || action.sector || 'Unknown'}`;
        if (action.goal) {
            label += ` (${action.goal.substring(0, 30)}${action.goal.length > 30 ? '...' : ''})`;
        }
        const option = document.createElement('option');
        option.value = actionId;
        option.textContent = label;
        option.setAttribute('data-action-index', index);
        selector.appendChild(option);
    });

    selector.addEventListener('change', function () {
        displaySelectedActionDetails(this.value, actions);
    });
}

function displaySelectedActionDetails(actionId, actions) {
    if (!actionId || !actions || actions.length === 0) return;

    // Find the action
    const action = actions.find(a =>
        (a.id && a.id.toString() === actionId) ||
        (a.number && a.number.toString() === actionId) ||
        (actions.indexOf(a).toString() === actionId)
    ) || actions[parseInt(actionId) || 0];

    if (!action) return;

    // Create or update action details display
    let detailsContainer = document.getElementById('adj-action-details');
    if (!detailsContainer) {
        detailsContainer = document.createElement('div');
        detailsContainer.id = 'adj-action-details';
        detailsContainer.style.marginTop = '16px';
        detailsContainer.style.padding = '16px';
        detailsContainer.style.background = 'var(--color-bg-secondary, #f5f5f5)';
        detailsContainer.style.borderRadius = '8px';
        detailsContainer.style.border = '1px solid var(--color-border, #ddd)';

        const selector = document.getElementById('adj-action-selector');
        if (selector && selector.parentNode) {
            selector.parentNode.insertBefore(detailsContainer, selector.nextSibling);
        }
    }

    const mechanismNames = {
        'sanctions': 'Sanctions/Financial Restrictions',
        'export': 'Export Controls',
        'investment': 'Investment / Capital Controls',
        'trade': 'Trade Policy',
        'financial': 'Financial/ Digital Asset Policy',
        'economic': 'General Economic Statecraft/Cross-Cutting Tools',
        'industrial': 'Industrial Policy',
        'infrastructure': 'Infrastructure & Workforce Development/Supply-Chain Resilience'
    };
    const sectorNames = {
        'biotechnology': 'Biotechnology',
        'agriculture': 'Agriculture',
        'telecommunications': 'Telecommunications'
    };
    const exposureNames = {
        'critical-minerals': 'Critical Minerals',
        'supply-chain': 'Supply Chain',
        'technologies': 'Technologies',
        'manufacturing': 'Manufacturing'
    };

    detailsContainer.innerHTML = `
                <h4 style="margin-top: 0; margin-bottom: 12px; font-size: 1rem;">Action ${action.number || 'N/A'} Details</h4>
                <div style="font-size: 0.875rem; line-height: 1.6;">
                    <div style="margin-bottom: 8px;"><strong>Mechanism:</strong> ${mechanismNames[action.mechanism] || action.mechanism || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Sector:</strong> ${sectorNames[action.sector] || action.sector || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Targets:</strong> ${(action.targets || []).join(', ').toUpperCase() || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Type of Exposure:</strong> ${exposureNames[action.exposure] || action.exposure || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Goal:</strong> ${action.goal || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Expected Outcomes:</strong> ${action.outcomes || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Ally Contingencies:</strong> ${action.contingencies || 'N/A'}</div>
                </div>
            `;
}

// Rulings
async function addRuling() {
    const subject = document.getElementById('rulingSubject').value.trim();
    const ruling = document.getElementById('rulingText').value.trim();
    const rationale = document.getElementById('rulingRationale').value.trim();

    if (!subject || !ruling) {
        alert('Please fill in subject and ruling');
        return;
    }

    const rulingRecord = {
        subject: subject,
        ruling: ruling,
        rationale: rationale,
        time: new Date().toLocaleTimeString(),
        timestamp: (window.toIsoNow ? toIsoNow() : new Date().toISOString()),
        move: currentMove
    };

    // Save to localStorage (move-only)
    const rulingsKey = `whiteCellRulings_move_${currentMove}`;
    let rulings = [];
    try {
        const stored = localStorage.getItem(rulingsKey) || '[]';
        rulings = JSON.parse(stored);
    } catch (e) {
        console.error('Error loading rulings:', e);
        rulings = [];
    }
    rulings.push(rulingRecord);
    try {
        localStorage.setItem(rulingsKey, JSON.stringify(rulings));
    } catch (e) {
        console.error('Error saving ruling:', e);
        alert('Failed to save ruling. Browser storage may be full.');
        return;
    }

    // Append canonical timeline event
    appendTimelineItem(currentMove, {
        phase: 'adjudication',
        type: 'ruling',
        title: `Ruling: ${subject}`,
        content: ruling,
        team: 'white',
        refs: { rationale }
    });

    // Schema-compliant adjudication adapter
    try {
        const selectedActionId = document.getElementById('adj-action-selector')?.value || null;
        const adj = {
            linked_action_id: selectedActionId || null,
            timestamp_ruling: rulingRecord.timestamp,
            outcome_verdict: 'Partial Success',
            narrative: rationale || ruling,
            impact_matrix: {
                technological_edge: { net_advantage: 'Neutral' },
                supply_chain_resilience: { net_advantage: 'Neutral' },
                alliance_cohesion: { net_advantage: 'Neutral' },
                industrial_base: { net_advantage: 'Neutral' },
                operational_window: { net_advantage: 'Neutral' },
                economic_shock: { net_advantage: 'Neutral' }
            }
        };
        const key = `adjudications_move_${currentMove}`;
        const arr = safeGetItem(key, []);
        arr.push(adj);
        safeSetItem(key, arr);
    } catch (e) {
        console.error('Failed to persist adjudication adapter', e);
    }

    displayRulingLog();
    updateBadges();

    document.getElementById('rulingSubject').value = '';
    document.getElementById('rulingText').value = '';
    document.getElementById('rulingRationale').value = '';
}

async function displayRulingLog() {
    const container = document.getElementById('rulingLogContainer');

    try {
        let rulings = [];

        // Try to load from database first
        if (hasUtil && currentSessionId) {
            try {
                // Fetch actions with adjudications for current move
                const actions = await window.esg.fetchActions(currentMove, currentSessionId);
                const adjudicatedActions = (actions || []).filter(a => a.status === 'adjudicated' && a.adjudication);

                rulings = adjudicatedActions.map(action => {
                    const adj = action.adjudication;
                    return {
                        actionId: action.id,
                        subject: `Action ${action.id.substring(0, 8)}...`,
                        ruling: adj.outcome || 'Unknown',
                        rationale: adj.narrative || '',
                        vulnerabilities: adj.vulnerabilities || [],
                        interdependencies: adj.interdependencies || {},
                        structuralImpacts: adj.structuralImpacts || {},
                        time: new Date(action.updated_at || action.created_at).toLocaleTimeString(),
                        timestamp: adj.timestamp || action.updated_at || action.created_at,
                        move: adj.move || currentMove,
                        phase: adj.phase || 1
                    };
                });
            } catch (error) {
                console.error('Error loading adjudications from database:', error);
                // Fall through to localStorage fallback
            }
        }

        // Fallback to localStorage if database not available or empty
        if (rulings.length === 0) {
            const rulingsKey = `whiteCellRulings_move_${currentMove}`;
            let localRulings = [];
            try {
                const stored = localStorage.getItem(rulingsKey) || localStorage.getItem('whiteCellRulings') || '[]';
                localRulings = JSON.parse(stored);
            } catch (e) {
                console.error('Error parsing rulings:', e);
                localRulings = [];
            }
            rulings = localRulings.filter(r => r.move === currentMove || !r.move);
        }

        if (rulings.length === 0) {
            container.innerHTML = `
                        <div class="empty-state">
                            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                            <p>No rulings recorded yet</p>
                            <p>Rulings will appear here as they are made</p>
                        </div>
                    `;
        } else {
            container.innerHTML = rulings.map(r => `
                        <div class="action-item">
                            <div class="action-header">
                                <span class="action-number">${r.subject}</span>
                                <span style="font-size: 0.6875rem; color: var(--color-text-muted);">${r.time}</span>
                            </div>
                            <div style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 8px;">${r.ruling}</div>
                            ${r.rationale ? `<div style="font-size: 0.75rem; color: var(--color-text-muted); font-style: italic;">Rationale: ${r.rationale}</div>` : ''}
                        </div>
                    `).reverse().join('');
        }
    } catch (error) {
        console.error('Error loading rulings:', error);
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        <p>Error loading rulings</p>
                        <p>Please refresh the page</p>
                    </div>
                `;
    }
}

// Adjudication submission
async function submitAdjudication() {
    try {
        // Get selected action ID
        const actionSelector = document.getElementById('adj-action-selector');
        const selectedActionId = actionSelector ? actionSelector.value : '';

        if (!selectedActionId) {
            showToast('Please select an action to adjudicate');
            return;
        }

        const data = {
            actionId: selectedActionId,
            vulnerabilities: Array.from(document.querySelectorAll('.adj-vulnerability:checked')).map(cb => cb.value),
            interdependencies: {},
            structuralImpacts: {},
            outcome: document.querySelector('[name="adj-outcome"]:checked')?.value,
            narrative: document.getElementById('adj-narrative')?.value,
            timestamp: new Date().toISOString(),
            move: currentMove,
            phase: currentPhase
        };

        // Collect interdependencies
        ['Ally-to-Ally', 'Ally-to-Adversary', 'Adversary Internal'].forEach(rel => {
            const impactSelect = document.querySelector(`[data-rel="${rel}"].adj-impact-nature`);
            const nameMap = {
                'Ally-to-Ally': 'sev-ally-ally',
                'Ally-to-Adversary': 'sev-ally-adv',
                'Adversary Internal': 'sev-adv-int'
            };
            const severityRadio = document.querySelector(`[name="${nameMap[rel]}"]:checked`);
            if (impactSelect || severityRadio) {
                data.interdependencies[rel] = {
                    impact: impactSelect?.value || '',
                    severity: severityRadio?.value || ''
                };
            }
        });

        // Collect structural impacts
        const tracks = ['Technological Edge', 'Industrial & Production Base', 'Supply-Chain Resilience',
            'Alliance System & Coordination', 'Operational Window', 'Economic & Political Shock Exposure'];
        tracks.forEach(track => {
            const blueSelect = document.querySelector(`[data-track="${track}"].adj-blue-pos`);
            const redSelect = document.querySelector(`[data-track="${track}"].adj-red-traj`);
            const advSelect = document.querySelector(`[data-track="${track}"].adj-net-adv`);
            if (blueSelect || redSelect || advSelect) {
                data.structuralImpacts[track] = {
                    blueEffect: blueSelect?.value || '',
                    redEffect: redSelect?.value || '',
                    advantage: advSelect?.value || ''
                };
            }
        });

        // HIGH-3: Enhanced validation with specific messages
        if (!data.outcome) {
            showToast('Please select an outcome');
            return;
        }

        if (!data.narrative || data.narrative.trim() === '') {
            showToast('Please provide a narrative');
            return;
        }

        if (data.narrative.trim().length < 20) {
            showToast('Narrative must be at least 20 characters');
            return;
        }

        // Validate at least one vulnerability is selected
        if (data.vulnerabilities.length === 0) {
            showToast('Please select at least one vulnerability');
            return;
        }

        // Validate structural impacts - at least one track should have data
        const hasStructuralImpact = Object.keys(data.structuralImpacts).some(track => {
            const impact = data.structuralImpacts[track];
            return impact.blueEffect || impact.redEffect || impact.advantage;
        });
        if (!hasStructuralImpact) {
            const confirmed = window.showConfirmModal ?
                await window.showConfirmModal('No structural impacts selected. Continue anyway?', 'Confirm', { confirmText: 'Continue', cancelText: 'Cancel' }) :
                confirm('No structural impacts selected. Continue anyway?');
            if (!confirmed) {
                return;
            }
        }

        // Save to database if available, otherwise fallback to localStorage
        if (hasUtil && currentSessionId) {
            try {
                // Format adjudication data for database
                const adjData = {
                    outcome: data.outcome,
                    narrative: data.narrative,
                    vulnerabilities: data.vulnerabilities,
                    interdependencies: data.interdependencies,
                    structuralImpacts: data.structuralImpacts,
                    timestamp: data.timestamp,
                    move: currentMove,
                    phase: currentPhase
                };

                // Submit adjudication to database
                await window.esg.submitAdjudication(selectedActionId, adjData);

                if (window.esg.showToast) {
                    window.esg.showToast('Adjudication saved successfully');
                } else {
                    showToast('Adjudication saved successfully');
                }
            } catch (error) {
                console.error('Error saving adjudication to database:', error);
                if (window.showAlertModal) {
                    await window.showAlertModal('Failed to save adjudication to database. Please try again.', 'Error');
                } else {
                    alert('Failed to save adjudication to database. Please try again.');
                }
                return;
            }
        } else {
            // Fallback to localStorage
            const key = `adjudications_move_${currentMove}`;
            let existing = [];
            try {
                const stored = localStorage.getItem(key) || '[]';
                existing = JSON.parse(stored);
            } catch (e) {
                console.error('Error loading adjudications:', e);
                existing = [];
            }
            existing.push(data);
            try {
                localStorage.setItem(key, JSON.stringify(existing));
            } catch (e) {
                console.error('Error saving adjudication:', e);
                if (e.name === 'QuotaExceededError') {
                    alert('Browser storage is full. Please clear some data or use a different browser.');
                } else {
                    alert('Failed to save adjudication. Please try again.');
                }
                return;
            }

            // Also add a simple ruling entry for the log
            const rulingRecord = {
                subject: `Adjudication: ${data.outcome}`,
                ruling: data.narrative.substring(0, 200) + (data.narrative.length > 200 ? '...' : ''),
                rationale: `Structural impacts and interdependencies assessed. Outcome: ${data.outcome}`,
                time: new Date().toLocaleTimeString(),
                timestamp: Date.now(),
                move: currentMove
            };
            // Save ruling with move-only key
            const rulingsKey = `whiteCellRulings_move_${currentMove}`;
            let rulings = [];
            try {
                const stored = localStorage.getItem(rulingsKey) || '[]';
                rulings = JSON.parse(stored);
            } catch (e) {
                console.error('Error loading rulings:', e);
                rulings = [];
            }
            rulings.push(rulingRecord);
            try {
                localStorage.setItem(rulingsKey, JSON.stringify(rulings));
            } catch (e) {
                console.error('Error saving ruling:', e);
                alert('Failed to save ruling. Browser storage may be full.');
                return;
            }
            showToast('Adjudication saved to local storage');
        }

        // Update ruling log
        await displayRulingLog();
        updateBadges();

        // Clear form (optional - comment out if you want to keep data)
        document.getElementById('adj-narrative').value = '';
        document.querySelectorAll('.adj-vulnerability:checked').forEach(cb => cb.checked = false);
        document.querySelectorAll('[name="adj-outcome"]:checked').forEach(rb => rb.checked = false);
        document.querySelectorAll('.adj-impact-nature').forEach(sel => sel.value = '');
        document.querySelectorAll('[name^="sev-"]:checked').forEach(rb => rb.checked = false);
        document.querySelectorAll('.adj-blue-pos, .adj-red-traj, .adj-net-adv').forEach(sel => sel.value = '');

    } catch (error) {
        console.error('Error saving adjudication:', error);
        alert('Failed to save adjudication. Please try again.');
    }
}

// Communication
async function sendResponseToBlue() {
    console.log('Sending response to BLUE...');
    const type = document.getElementById('responseType').value;
    const title = document.getElementById('responseTitle').value.trim();
    const content = document.getElementById('responseContent').value.trim();

    if (!title || !content) {
        if (window.showAlertModal) {
            await window.showAlertModal('Please fill in both title and content.', 'Validation Error');
        } else {
            alert('Please fill in both title and content.');
        }
        return;
    }

    // Attempt to link to most recent BLUE request when RFI_RESPONSE
    let linked_request_id = null;
    if ((window.ENUMS && ENUMS.whiteCommTypes.includes('RFI_RESPONSE')) && String(type).toUpperCase() === 'RFI_RESPONSE') {
        try {
            if (hasUtil && currentSessionId) {
                // Fetch from database
                const requests = await window.esg.fetchRequests(currentSessionId);
                if (requests && requests.length > 0) {
                    // Default to NEWEST request (index 0) if not specified
                    linked_request_id = requests[0].id;
                }
            } else {
                // Fallback to localStorage
                const reqs = safeGetItem(getRequestsKey(), []);
                const last = Array.isArray(reqs) && reqs.length ? reqs[reqs.length - 1] : null;
                linked_request_id = last?.id || null;
            }
        } catch (e) {
            console.error('Error finding linked request:', e);
        }
    }

    const response = {
        type: type,
        title: title,
        content: content,
        move: currentMove,
        timestamp: (window.toIsoNow ? toIsoNow() : new Date().toISOString()),
        respondedAt: (window.toIsoNow ? toIsoNow() : new Date().toISOString()),
        from: 'WHITE Cell',
        to: 'BLUE Team',
        linked_request_id: linked_request_id
    };

    // Save to database if available, otherwise fallback to localStorage
    if (hasUtil && currentSessionId) {
        try {
            // If this is an RFI response and we have a linked request, use sendResponse
            if (linked_request_id && String(type).toUpperCase() === 'RFI_RESPONSE') {
                const requests = await window.esg.fetchRequests(currentSessionId);
                const request = requests ? requests.find(r => r.id === linked_request_id) : null;
                if (request) {
                    await window.esg.sendResponse(request, content);
                } else {
                    // Create communication entry instead
                    await window.esg.postTimelineItem('white', 'communication', `${title}: ${content}`, {
                        move: currentMove,
                        metadata: { type, linked_request_id }
                    });
                }
            } else {
                // Create communication entry
                await window.esg.postTimelineItem('white', 'communication', `${title}: ${content}`, {
                    move: currentMove,
                    metadata: { type, linked_request_id }
                });
            }

            if (window.esg.showToast) {
                window.esg.showToast('Response sent to BLUE Team!');
            }
        } catch (error) {
            console.error('Error saving communication to database:', error);
            if (window.showAlertModal) {
                await window.showAlertModal('Failed to save communication to database. Please try again.', 'Error');
            } else {
                alert('Failed to save communication to database. Please try again.');
            }
            return;
        }
    } else {
        // Fallback to localStorage
        const commKey = `communications_move_${currentMove}`;
        console.log(`Saving communication to ${commKey}`);
        let arr = [];
        try {
            arr = safeGetItem(commKey, []);
            if (!Array.isArray(arr)) arr = [];
        } catch (e) {
            console.error('Error loading communications:', e);
            arr = [];
        }
        arr.push(response);
        try {
            safeSetItem(commKey, arr);
            console.log('Communication saved successfully.');
        } catch (e) {
            console.error('Error saving communication:', e);
            if (e.name === 'QuotaExceededError') {
                alert('Browser storage is full. Please clear some data or use a different browser.');
            } else {
                alert('Failed to save communication. Please try again.');
            }
            return;
        }

        // Use showToast if available, otherwise alert
        if (window.showToast) {
            showToast('Response sent to BLUE Team!');
        } else {
            alert('Response sent to BLUE Team!');
        }
    }

    // Append canonical timeline event
    const timelineItem = {
        phase: 'Adjudication', // Capitalized to match mapPhaseEnum
        type: 'white_feedback',
        title: response.title,
        content: response.content,
        team: 'white',
        refs: { to: 'blue' },
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now()
    };

    if (hasUtil && currentSessionId) {
        try {
            await window.esg.postTimelineItem('white', 'white_feedback', title, {
                move: currentMove,
                metadata: { content, to: 'blue' }
            });
        } catch (error) {
            console.error('Error posting timeline item:', error);
        }

        // ALSO save to feedback storage for Facilitator to retrieve
        try {
            const feedbackKey = `whiteCellFeedback_move_${currentMove}`;
            let feedback = safeGetItem(feedbackKey, []);
            if (!Array.isArray(feedback)) feedback = [];

            feedback.push({
                summary: title,
                notes: content,
                timestamp: response.timestamp,
                type: type,
                move: currentMove
            });

            safeSetItem(feedbackKey, feedback);
            console.log(`Saved response to ${feedbackKey} for Facilitator retrieval`);
        } catch (error) {
            console.error('Error saving to feedback storage:', error);
        }
    } else {
        // Update local timelineItems FIRST to prevent overwrite by saveData
        timelineItems.push({
            ...timelineItem,
            phase: 4 // Map 'Adjudication' to 4 for local storage consistency
        });

        // Update shared storage
        appendTimelineItem(currentMove, timelineItem);

        // ALSO save to feedback storage for Facilitator to retrieve
        const feedbackKey = `whiteCellFeedback_move_${currentMove}`;
        let feedback = safeGetItem(feedbackKey, []);
        if (!Array.isArray(feedback)) feedback = [];

        feedback.push({
            summary: title,
            notes: content,
            timestamp: response.timestamp,
            type: type,
            move: currentMove
        });

        safeSetItem(feedbackKey, feedback);

        // Save local state to persist the new timeline item
        saveData();
    }

    document.getElementById('responseTitle').value = '';
    document.getElementById('responseContent').value = '';

    console.log('Refreshing communication log...');
    displayCommunicationLog();
    updateTimeline(); // Refresh timeline UI
    updateBadges();
}

async function displayCommunicationLog() {
    const container = document.getElementById('communicationLogContainer');
    console.log('Displaying communication log for move:', currentMove);

    try {
        let responses = [];

        // Try to load from database first
        if (hasUtil && currentSessionId) {
            try {
                // Fetch communications from database
                const comms = await window.esg.fetchCommunications();
                // Filter by move if needed and map to response format
                responses = (comms || []).filter(c => {
                    const move = c.move || (c.metadata && c.metadata.move);
                    return !move || move === currentMove;
                }).map(c => ({
                    type: c.metadata?.type || 'communication',
                    title: c.title || c.content?.substring(0, 50) || 'Communication',
                    content: c.content || '',
                    move: c.move || c.metadata?.move || currentMove,
                    timestamp: c.created_at || c.timestamp,
                    respondedAt: c.created_at || c.timestamp,
                    from: 'WHITE Cell',
                    to: 'BLUE Team',
                    linked_request_id: c.linked_request_id || c.metadata?.linked_request_id
                }));
            } catch (error) {
                console.error('Error loading communications from database:', error);
                // Fall through to localStorage fallback
            }
        }

        // Fallback to localStorage if database not available or empty
        if (responses.length === 0) {
            const commKey = `communications_move_${currentMove}`;
            console.log(`Loading communications from ${commKey}`);
            try {
                responses = safeGetItem(commKey, []);
                if (!Array.isArray(responses)) responses = [];
                console.log(`Loaded ${responses.length} communications from storage.`);
            } catch (e) {
                console.error('Error parsing communications:', e);
                responses = [];
            }
        }

        if (responses.length === 0) {
            container.innerHTML = `
                        <div class="empty-state">
                            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            <p>No communications sent yet</p>
                            <p>Messages will appear here when sent</p>
                        </div>
                    `;
            return;
        }

        container.innerHTML = responses.map(response => `
                    <div class="action-item">
                        <div class="action-header">
                            <span class="action-number">${response.title}</span>
                            <span style="font-size: 0.6875rem; color: var(--color-text-muted);">${(response.type || 'communication').replace('_', ' ').toUpperCase()}</span>
                        </div>
                        <div style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 8px;">
                            <strong>From:</strong> ${response.from || 'WHITE Cell'}<br>
                            <strong>To:</strong> ${response.to || 'BLUE Team'}<br>
                            <strong>Message:</strong> ${response.content}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--color-text-muted);">
                            Sent: ${new Date(response.timestamp).toLocaleString()}
                        </div>
                    </div>
                `).reverse().join('');
    } catch (error) {
        console.error('Error loading communications:', error);
        // Fallback to localStorage (move-only)
        const commKey = `communications_move_${currentMove}`;
        let responses = [];
        try {
            responses = safeGetItem(commKey, []);
            if (!Array.isArray(responses)) responses = [];
        } catch (e) {
            console.error('Error parsing communications in fallback:', e);
            responses = [];
        }

        if (responses.length === 0) {
            container.innerHTML = `
                        <div class="empty-state">
                            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            <p>No communications sent yet</p>
                            <p>Messages will appear here when sent</p>
                        </div>
                    `;
            return;
        }

        container.innerHTML = responses.map(response => `
                    <div class="action-item">
                        <div class="action-header">
                            <span class="action-number">${response.title}</span>
                            <span style="font-size: 0.6875rem; color: var(--color-text-muted);">${(response.type || 'communication').replace('_', ' ').toUpperCase()}</span>
                        </div>
                        <div style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 8px;">
                            <strong>From:</strong> ${response.from || 'WHITE Cell'}<br>
                            <strong>To:</strong> ${response.to || 'BLUE Team'}<br>
                            <strong>Message:</strong> ${response.content}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--color-text-muted);">
                            Sent: ${new Date(response.timestamp).toLocaleString()}
                        </div>
                    </div>
                `).reverse().join('');
    }
}

// Save/Load
async function saveData() {
    if (isResetting) return;
    try {
        const data = {
            timestamp: new Date().toISOString(),
            timerRemaining: timerSeconds,
            timelineItems: timelineItems,
            currentPhase: currentPhase,
            move: currentMove
        };

        document.querySelectorAll('input, textarea, select').forEach(el => {
            if (el.id && el.id !== 'moveSelector') data[el.id] = el.value;
        });

        // Save to localStorage (move-only)
        safeSetItem(getWhiteCellKey(), data);

        // Also save timer state to shared location
        saveTimerState();

        // Auto-save to data_storage folder (throttled - only every 30 seconds)
        if (typeof autoSaveWhiteCellData === 'function') {
            const lastSave = localStorage.getItem(`lastAutoSave_whitecell_${currentMove}`);
            const now = Date.now();
            if (!lastSave || (now - parseInt(lastSave)) > 30000) {
                autoSaveWhiteCellData(undefined, currentMove);
                localStorage.setItem(`lastAutoSave_whitecell_${currentMove}`, now.toString());
            }
        }
    } catch (e) {
        console.error('Failed to save data', e);
        if (e.name === 'QuotaExceededError') {
            alert('Browser storage is full. Please clear some data or use a different browser.');
        } else {
            console.error('Unexpected error saving data:', e);
        }
        showToast('Error saving data');
    }
}

async function loadData() {
    // Load from localStorage with validation (move-only)
    let saved = safeGetItem(getWhiteCellKey(), null);
    if (saved) {
        let data = saved;

        // Validate data structure with strict validation
        const schema = {
            timelineItems: { type: 'array', required: false, default: [] },
            currentPhase: { type: 'number', required: false, default: 1 },
            move: { type: 'number', required: false },
            timestamp: { type: 'string', required: false }
        };

        const validated = validateDataStrict(data, schema, false);
        if (!validated) {
            console.warn('Data validation failed, using empty data');
            showToast('Data validation failed - some data may be missing');
            data = { timelineItems: [], currentPhase: 1 };
        } else {
            data = validated;
        }

        Object.keys(data).forEach(key => {
            const el = document.getElementById(key);
            if (el && key !== 'moveSelector') el.value = data[key];
        });

        if (data.timelineItems) {
            timelineItems = data.timelineItems;
            updateTimeline();
            updateBadges();
        }

        // Timer state is loaded from shared storage via loadTimerState()
        // Don't override with local save data

        if (data.currentPhase) {
            currentPhase = data.currentPhase;
            document.querySelectorAll('.phase-btn').forEach(btn => {
                const isActive = parseInt(btn.getAttribute('data-phase')) === currentPhase;
                btn.classList.toggle('active', isActive);
            });
            updatePhaseGuidance();
        }
    }

    displayRulingLog();
    displayCommunicationLog();
}

function exportNotes() {
    try {
        const moves = {};
        for (let i = 1; i <= 3; i++) {
            // Move-only key
            const data = safeGetItem((window.buildMoveKey && buildMoveKey(i, 'whitecell')) || `whiteCell_move_${i}`, null);
            if (data) moves[i] = data;
        }

        // Collect all rulings for all moves
        const allRulings = [];
        for (let i = 1; i <= 3; i++) {
            const rulings = safeGetItem(`whiteCellRulings_move_${i}`, []);
            if (Array.isArray(rulings)) {
                allRulings.push(...rulings);
            }
        }
        // Also check legacy global key
        const legacyRulings = safeGetItem('whiteCellRulings', []);
        if (Array.isArray(legacyRulings)) {
            allRulings.push(...legacyRulings);
        }

        // Collect all communications for all moves
        const allCommunications = [];
        for (let i = 1; i <= 3; i++) {
            // Get communications from move-only key
            const commKey = `communications_move_${i}`;
            const comms = safeGetItem(commKey, []);
            if (Array.isArray(comms)) {
                allCommunications.push(...comms);
            }

            // Also include feedback entries
            const feedbackKey = `whiteCellFeedback_move_${i}`;
            const feedback = safeGetItem(feedbackKey, []);
            if (Array.isArray(feedback)) {
                feedback.forEach(f => allCommunications.push({
                    title: f.summary,
                    type: 'white_feedback',
                    content: f.notes || '',
                    move: f.move,
                    timestamp: f.timestamp
                }));
            }
        }

        // Collect all adjudications
        const allAdjudications = [];
        for (let i = 1; i <= 3; i++) {
            const adj = safeGetItem(`adjudications_move_${i}`, []);
            if (Array.isArray(adj)) {
                allAdjudications.push(...adj);
            }
        }

        const exportData = {
            exported: new Date().toISOString(),
            exportedBy: 'WHITE Cell Control',
            currentMove: currentMove,
            currentPhase: currentPhase,
            allMoves: moves,
            rulings: allRulings,
            communications: allCommunications,
            adjudications: allAdjudications,
            decisionTimeline: buildDecisionTimeline(moves)
        };

        if (Object.keys(moves).length === 0 && allRulings.length === 0 && allCommunications.length === 0) {
            alert('No data to export. Please add some data first.');
            return;
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
        a.download = `WHITE_Cell_${timestamp}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Data exported successfully');
    } catch (error) {
        console.error('Error exporting data:', error);
        alert(`Error exporting data: ${error.message || 'Unknown error'}`);
        showToast('Export failed');
    }
}

// Make function globally available
window.exportNotes = exportNotes;

function buildDecisionTimeline(moves) {
    const timeline = [];
    for (let move in moves) {
        const data = moves[move];
        if (data.timelineItems) {
            data.timelineItems.forEach(item => {
                timeline.push({
                    move: move,
                    time: item.time,
                    phase: item.phase,
                    type: item.type,
                    content: item.content
                });
            });
        }
    }
    return timeline;
}

function submitNotes() {
    saveData();
    const data = safeGetItem(`whiteCell_move_${currentMove}`, null);
    if (!data) {
        alert('No data to finalize');
        return;
    }

    const timelineCount = data.timelineItems?.length || 0;
    const rulings = safeGetItem(`whiteCellRulings_move_${currentMove}`, []) ||
        safeGetItem('whiteCellRulings', []);
    const feedback = safeGetItem(`whiteCellFeedback_move_${currentMove}`, []);

    let summary = `Finalize Move ${currentMove}?\n\n`;
    summary += `Timeline items: ${timelineCount}\n`;
    summary += `Rulings recorded: ${rulings.length}\n`;
    summary += `Communications sent: ${feedback.length}\n\n`;
    summary += `This will mark the move as complete.`;

    if (confirm(summary)) {
        data.finalized = true;
        data.finalizedAt = new Date().toISOString();
        safeSetItem(`whiteCell_move_${currentMove}_finalized`, data);

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `WHITE_Cell_Move${currentMove}_Finalized_${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        alert(`Move ${currentMove} finalized.\n\nFinalization file downloaded for your records.`);
    }
}

function resetAllLocalStorage() {
    if (!confirm('Clear all stored data for the WHITE Cell? This cannot be undone.')) return;
    const prefixes = [
        'whiteCell_move_',
        'whiteCellFeedback_move_',
        'whiteCellRulings_move_',
        'communications_move_',
        'adjudications_move_',
        'blueActions_move_',
        'blueRequests_move_',
        'blueActionsSubmittedMove',
        'blueRequestsSubmittedMove',
        'greenMove',
        'redMove',
        'sharedTimer',
        'sharedGameState'
    ];
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (prefixes.some(p => key.startsWith(p))) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    timelineItems = [];
    updateTimeline();
    updateBadges();
    timerSeconds = 90 * 60;
    updateTimer();
    currentPhase = 1;
    document.querySelectorAll('.phase-btn').forEach(btn => {
        const isActive = parseInt(btn.getAttribute('data-phase')) === currentPhase;
        btn.classList.toggle('active', isActive);
    });
    updatePhaseGuidance();
    document.getElementById('moveSelector').value = '1';
    currentMove = 1;
    document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];
    document.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.id && el.id !== 'moveSelector') el.value = '';
    });

    alert('All local data cleared. The page will now reload.');
    location.reload();
}

// Initialize
loadTimerState(); // Load timer state from shared storage

// Restore state from shared storage
const sharedState = safeGetItem(getSharedGameStateKey(), null);
if (sharedState) {
    if (sharedState.move) {
        currentMove = sharedState.move;
        const moveSelector = document.getElementById('moveSelector');
        if (moveSelector) {
            moveSelector.value = currentMove;
            const epochEl = document.getElementById('moveEpoch');
            if (epochEl && moveEpochs[currentMove]) {
                epochEl.textContent = moveEpochs[currentMove];
            }
        }
    }
    if (sharedState.phase) {
        currentPhase = sharedState.phase;
        document.querySelectorAll('.phase-btn').forEach(btn => {
            const isActive = parseInt(btn.getAttribute('data-phase')) === currentPhase;
            btn.classList.toggle('active', isActive);
        });
    }
}
updatePhaseGuidance();
loadData(); // This is now async
updateBadges();
populateActionSelector(); // Populate action selector on load

// Setup real-time subscriptions if database is available
if (hasUtil && currentSessionId) {
    setupSubscriptions();
}

// CRITICAL-5: Start heartbeat system
if (window.researchTracking && window.researchTracking.startParticipantHeartbeat) {
    window.researchTracking.startParticipantHeartbeat();
}

// Function to setup real-time subscriptions
function setupSubscriptions() {
    if (!hasUtil || !currentSessionId) return;

    // Subscribe to actions
    window.esg.subscribeToActions((payload) => {
        const action = payload.new || payload.old;
        if (action && (action.move === currentMove || !action.move)) {
            loadSubmittedActions();
            populateActionSelector();
            updateBadges();
        }
    });

    // Subscribe to requests
    window.esg.subscribeToRequests((payload) => {
        const request = payload.new || payload.old;
        if (request && (request.move === currentMove || !request.move)) {
            loadSubmittedRequests();
            updateBadges();
        }
    });

    // Subscribe to timeline
    window.esg.subscribeToTimeline((item) => {
        console.log('Timeline update received:', item);
        if (item && item.move == currentMove) {
            updateTimeline();
            updateBadges();
        }
    });

    // Subscribe to communications
    window.esg.subscribeToCommunications((comm) => {
        const move = comm.move || (comm.metadata && comm.metadata.move);
        if (!move || move === currentMove) {
            displayCommunicationLog();
            updateBadges();
        }
    });

    // Subscribe to game state changes
    window.esg.subscribeToGameState((state) => {
        if (state.move && state.move !== currentMove) {
            currentMove = state.move;
            document.getElementById('moveSelector').value = currentMove;
            document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];
            loadData();
        }
        if (state.phase && state.phase !== currentPhase) {
            currentPhase = state.phase;
            document.querySelectorAll('.phase-btn').forEach(btn => {
                const isActive = parseInt(btn.getAttribute('data-phase')) === currentPhase;
                btn.classList.toggle('active', isActive);
            });
            updatePhaseGuidance();
        }
    });
}

setInterval(saveData, 30000);
// Synchronous save on beforeunload (guaranteed to complete)
window.addEventListener('beforeunload', () => {
    // CRITICAL-5: Stop heartbeat system
    if (window.researchTracking && window.researchTracking.stopParticipantHeartbeat) {
        window.researchTracking.stopParticipantHeartbeat();
    }

    if (isResetting) return;
    try {
        const data = {
            timestamp: new Date().toISOString(),
            timerRemaining: timerSeconds,
            timelineItems: timelineItems,
            currentPhase: currentPhase,
            move: currentMove
        };

        // Collect form data synchronously
        document.querySelectorAll('input, textarea, select').forEach(el => {
            if (el.id && el.id !== 'moveSelector') data[el.id] = el.value;
        });

        // Synchronous localStorage write
        const key = `whiteCell_move_${currentMove}`;
        localStorage.setItem(key, JSON.stringify(data));

        // Also save timer state synchronously
        const timerState = {
            seconds: timerSeconds,
            running: timerRunning,
            lastUpdate: Date.now()
        };
        localStorage.setItem(`sharedTimer`, JSON.stringify(timerState));
    } catch (e) {
        console.error('Error in beforeunload save:', e);
    }
});

// Auto-refresh timeline data every 5 seconds
setInterval(() => {
    const timelineSection = document.getElementById('timeline');
    if (timelineSection && timelineSection.classList.contains('active')) {
        updateTimeline();
        updateBadges();
    }
    // Also refresh action selector periodically
    const adjSection = document.getElementById('adjudication');
    if (adjSection && adjSection.classList.contains('active')) {
        populateActionSelector();
    }
}, 5000);

// Flag to prevent saving during reset
let isResetting = false;

// Listen for storage changes for cross-window/tab updates
window.addEventListener('storage', (e) => {
    // Check for full wipe (key is null)
    if (e.key === null) {
        console.log('Storage cleared, reloading...');
        isResetting = true;
        window.location.reload();
        return;
    }
    if (e.key === '_timelineUpdate' && e.newValue) {
        try {
            const broadcast = JSON.parse(e.newValue);
            if (broadcast.moveNumber === currentMove) {
                const item = {
                    ...broadcast.item,
                    team: broadcast.team
                };
                timelineItems.push(item);
                updateTimeline();
                updateBadges();
            }
        } catch (err) {
            console.error('Failed to parse timeline update:', err);
        }
    }
    // Also listen for game state changes
    if (e.key === getSharedGameStateKey() && e.newValue) {
        try {
            const gameState = JSON.parse(e.newValue);
            if (gameState.move && gameState.move !== currentMove) {
                currentMove = gameState.move;
                document.getElementById('moveSelector').value = currentMove;
                document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];
                loadData();
            }
            if (gameState.phase && gameState.phase !== currentPhase) {
                currentPhase = gameState.phase;
                document.querySelectorAll('.phase-btn').forEach(btn => {
                    const isActive = parseInt(btn.getAttribute('data-phase')) === currentPhase;
                    btn.classList.toggle('active', isActive);
                });
                updatePhaseGuidance();
            }
        } catch (err) {
            console.error('Failed to parse game state update:', err);
        }
    }
});

// White Cell is the source of gameStateUpdated events, so it should NOT listen to them
// Only facilitator/notetaker pages should listen to sync with White Cell's changes
/*
window.addEventListener('gameStateUpdated', (e) => {
    const gameState = e.detail;
    if (gameState.move && gameState.move !== currentMove) {
        currentMove = gameState.move;
        document.getElementById('moveSelector').value = currentMove;
        document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];
        loadData();
    }
    if (gameState.phase && gameState.phase !== currentPhase) {
        currentPhase = gameState.phase;
        document.querySelectorAll('.phase-btn').forEach(btn => {
            const isActive = parseInt(btn.getAttribute('data-phase')) === currentPhase;
            btn.classList.toggle('active', isActive);
        });
        updatePhaseGuidance();
    }
});
*/

// Standardized loader hide
window.addEventListener('load', function () {
    setTimeout(function () {
        const loader = document.getElementById('loader');
        if (loader && !loader.classList.contains('hidden')) {
            loader.classList.add('hidden');
        }
    }, 1500);
});

// Use shared mapPhaseEnum and appendTimelineItem from data-layer.js

// Session picker removed

// Initialize game state on load
// Initialize game state on load - removed saveGameState() to prevent overwriting stored state with defaults
// saveGameState();

// Expose functions to global scope for HTML onclick handlers
window.sendResponseToBlue = sendResponseToBlue;
window.changeMoveContext = changeMoveContext;
window.submitAdjudication = submitAdjudication;
window.populateActionSelector = populateActionSelector;
window.loadSubmittedActions = loadSubmittedActions;
window.loadSubmittedRequests = loadSubmittedRequests;
window.displayRulingLog = displayRulingLog;
