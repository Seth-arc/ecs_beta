// Database integration with data-layer.js
const hasUtil = typeof window.esg !== 'undefined';
let currentSessionId = null;

// Move Management
let currentMove = 1;
let currentPhase = 1;
let currentFaction = null;

const moveEpochs = {
    1: 'Epoch 1 (2027-2030)',
    2: 'Epoch 2 (2030-2032)',
    3: 'Epoch 3 (2032-2034)'
};

const phaseGuidance = {
    1: "Phase 1: Internal Deliberation — Observe BLUE Team discussions and note decision cues",
    2: "Phase 2: Alliance Consultation — Track outreach and information requests",
    3: "Phase 3: Finalization — Capture final choices and rationale",
    4: "Phase 4: Adjudication — Note WHITE Cell feedback and team reactions",
    5: "Phase 5: Results Brief — Summarize outcomes and lessons"
};

// Read-only move and phase - controlled by White Cell (session removed)
function getSharedGameStateKey() {
    return (window.STORAGE_KEYS && STORAGE_KEYS.sharedState) || 'sharedGameState';
}

function getNotetakerKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'notetaker')) || `notes_move_${move}`;
}

function getRequestsKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'requests')) || `blueRequests_move_${move}`;
}

function syncPhaseButtons() {
    document.querySelectorAll('.phase-btn').forEach(btn => {
        if (parseInt(btn.getAttribute('data-phase')) === currentPhase) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function updatePhaseGuidance() {
    const container = document.getElementById('phaseGuidanceContainer');
    if (!container) return;
    container.innerHTML = `
                <div class="phase-guidance">
                    <strong>Current Phase ${currentPhase}</strong>
                    ${phaseGuidance[currentPhase]}
                </div>
            `;
}

function changeMoveContext() {
    // Disabled - move is controlled by White Cell
    showToast('Move changes are controlled by White Cell');
    updateGameStateFromShared();
}

function updateGameStateFromShared() {
    const gameState = safeGetItem(getSharedGameStateKey(), null);
    if (!gameState) return;

    // Update move
    if (gameState.move && gameState.move !== currentMove) {
        currentMove = gameState.move;
        const moveSelector = document.getElementById('moveSelector');
        if (moveSelector) { moveSelector.value = currentMove; }
        document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];
        const currentData = safeGetItem(getNotetakerKey(), null);
        if (currentData) {
            loadData();
        } else {
            document.querySelectorAll('input, textarea, select').forEach(el => {
                if (el.id && el.id !== 'moveSelector') el.value = '';
            });
            timelineItems = [];
            updateTimeline();
            try {
                const facilitatorData = safeGetItem((window.buildMoveKey && buildMoveKey(currentMove, 'facilitator')) || `actions_move_${currentMove}`, null);
                // Try move-only key
                let reqData = facilitatorData?.infoRequests || safeGetItem(getRequestsKey(), null);
                if (reqData) {
                    const parsed = Array.isArray(reqData) ? reqData : (reqData.requests || []);
                    const mapped = parsed.map((r, idx) => ({
                        type: 'requestinfo',
                        content: r.details || r.text || r.query_text || '',
                        phase: r.phase || currentPhase,
                        time: new Date(r.timestamp || Date.now()).toLocaleTimeString(),
                        timestamp: r.id || Date.now(),
                        faction: 'blue'
                    }));
                    timelineItems = mapped.concat(timelineItems);
                }

                // Merge facilitator actions
                const actionsData = facilitatorData || safeGetItem(`actions_move_${currentMove}`, null);
                if (actionsData && Array.isArray(actionsData.actions)) {
                    const mappedActions = actionsData.actions.map(a => ({
                        type: 'action',
                        content: `${a.mechanism || ''} | ${a.sector || ''} | Targets: ${(a.targets || []).join(', ')}`,
                        phase: a.phase || currentPhase,
                        time: new Date(a.timestamp || Date.now()).toLocaleTimeString(),
                        timestamp: a.id || Date.now(),
                        faction: 'blue'
                    }));
                    timelineItems = mappedActions.concat(timelineItems);
                }

                // Merge facilitator observations
                if (actionsData && Array.isArray(actionsData.observations)) {
                    const mappedObs = actionsData.observations.map(o => ({
                        type: 'observation',
                        content: o.text || '',
                        phase: o.phase || currentPhase,
                        time: o.timestamp || new Date().toLocaleTimeString(),
                        timestamp: o.id || Date.now(),
                        faction: 'blue'
                    }));
                    timelineItems = mappedObs.concat(timelineItems);
                }
            } catch (e) {
                console.error('Error merging facilitator data into timeline:', e);
            }
        }
    } // Update phase
    if (gameState.phase && gameState.phase !== currentPhase) {
        currentPhase = gameState.phase;
        syncPhaseButtons();
        updatePhaseGuidance();
    }
}

// Phase buttons - read-only, controlled by White Cell
document.querySelectorAll('.phase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        showToast('Phase changes are controlled by White Cell');
        updateGameStateFromShared();
    });
});

// Disable phase buttons visually
function disablePhaseButtons() {
    document.querySelectorAll('.phase-btn').forEach(btn => {
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disablePhaseButtons);
} else {
    disablePhaseButtons();
}

// Faction tagging
document.querySelectorAll('.faction-tag').forEach(btn => {
    btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        document.querySelectorAll('.faction-tag').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
            btn.classList.add('selected');
            currentFaction = btn.getAttribute('data-faction');
        } else {
            currentFaction = null;
        }
    });
});

// Debate markers
document.querySelectorAll('.debate-marker').forEach(btn => {
    btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        document.querySelectorAll('.debate-marker').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
            btn.classList.add('selected');
        }
    });
});

// Timer - Read-only display, controlled by White Cell
let timerSeconds = 90 * 60;

function getSharedTimerKey() {
    return (window.STORAGE_KEYS && STORAGE_KEYS.sharedTimer) || 'sharedTimer';
}

function updateTimer() {
    // Load timer state from shared storage
    const timerState = safeGetItem(getSharedTimerKey(), null);
    if (timerState) {
        // Calculate current time based on when it was last updated
        // Add maximum elapsed time cap to prevent incorrect time if page was closed for extended period
        const MAX_ELAPSED_SECONDS = 24 * 60 * 60; // 24 hours
        let currentSeconds = timerState.seconds || 90 * 60;
        if (timerState.running && timerState.lastUpdate) {
            const elapsed = Math.floor((Date.now() - timerState.lastUpdate) / 1000);
            const cappedElapsed = Math.min(elapsed, MAX_ELAPSED_SECONDS);
            currentSeconds = Math.max(0, currentSeconds - cappedElapsed);

            // If elapsed time exceeds cap, reset timer
            if (elapsed > MAX_ELAPSED_SECONDS) {
                currentSeconds = 90 * 60;
            }
        }
        timerSeconds = currentSeconds;
    }

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
}

// Hide timer controls (read-only display)
function hideTimerControls() {
    const timerControls = document.querySelector('.timer-controls');
    if (timerControls) {
        timerControls.style.display = 'none';
    }
}

// Hide controls immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideTimerControls);
} else {
    hideTimerControls();
}

// Poll timer state every second for real-time updates
setInterval(updateTimer, 1000);

// Initialize
updateTimer();

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const sectionId = item.getAttribute('data-section');
        document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');
    });
});

// Capture Types
const captureTypes = {
    note: 'General observations, team discussions, decisions being made...',
    moment: 'Significant turning point: decision made, position changed, consensus reached...',
    quote: 'Notable statement or memorable phrasing from a participant...',
    requestinfo: 'Team requesting information from WHITE Cell or observers...'
};

document.querySelectorAll('.capture-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.capture-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('captureHint').textContent = captureTypes[tab.getAttribute('data-type')];
    });
});

// Templates
function insertTemplate(type) {
    const templates = {
        disagree: '[DISAGREEMENT] Between ___ and ___ regarding: ',
        consensus: '[CONSENSUS] Team agreed on: ',
        question: '[QUESTION RAISED] ___ asked: ',
        concern: '[CONCERN] ___ expressed concern about: '
    };
    document.getElementById('quickCaptureText').value += templates[type];
    document.getElementById('quickCaptureText').focus();
}

// Expose globally for onclick handlers
window.insertTemplate = insertTemplate;

// Timeline Management
let timelineItems = [];

async function addCapture() {
    const text = document.getElementById('quickCaptureText').value.trim();
    if (!text) return;

    const activeType = document.querySelector('.capture-tab.active');
    const typeRaw = activeType ? activeType.getAttribute('data-type') : 'note';
    const type = (window.normalizeObservationType ? normalizeObservationType(typeRaw) : String(typeRaw).toUpperCase());

    const selectedMarker = document.querySelector('.debate-marker.selected');
    const marker = selectedMarker ? selectedMarker.getAttribute('data-marker') : null;

    const item = {
        id: Date.now(),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        phase: currentPhase,
        type: type,
        content: text,
        author_faction: currentFaction,
        marker: marker
    };

    // Save to database if available
    if (hasUtil && currentSessionId) {
        try {
            await window.esg.postTimelineItem('blue', type.toLowerCase(), text, {
                category: null,
                faction: currentFaction,
                marker: marker,
                metadata: { author_faction: currentFaction }
            });

            // HIGH-2: Log participant activity
            if (window.researchTracking && window.researchTracking.logParticipantActivity) {
                await window.researchTracking.logParticipantActivity(
                    currentSessionId,
                    window.esg.getClientId(),
                    'observation_added',
                    { type: type, faction: currentFaction, marker: marker }
                );
            }

            if (window.esg.showToast) {
                window.esg.showToast('Observation saved');
            }
        } catch (error) {
            console.error('Save timeline item error:', error);
            // Continue with localStorage fallback
        }
    }

    timelineItems.unshift(item);
    // Note: WHITE communications are merged in updateTimeline() on load, not here
    // to avoid duplication on every capture
    updateTimeline();
    updateBadges();
    saveData();

    document.getElementById('quickCaptureText').value = '';
    document.querySelectorAll('.faction-tag').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.debate-marker').forEach(b => b.classList.remove('selected'));
    currentFaction = null;
}

// Expose globally for onclick handlers
window.addCapture = addCapture;

function addAnalysisToTimeline(section) {
    const sectionNames = {
        dynamics: 'Team Dynamics',
        alliance: 'Alliance Engagement'
    };

    const item = {
        id: Date.now(),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        phase: currentPhase,
        type: 'NOTE',
        content: `${sectionNames[section]} analysis updated`,
        author_faction: null,
        marker: null
    };

    timelineItems.unshift(item);
    updateTimeline();
    updateBadges();
    saveData();
}

function updateTimeline() {
    const container = document.getElementById('timelineContainer');
    if (timelineItems.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <p>No observations documented yet</p>
                        <p>Begin capturing in the Quick Capture section</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = timelineItems.map(item => {
        let contentHtml = item.content;
        if (item.type === 'white_feedback') {
            contentHtml = `
                <strong>From:</strong> WHITE Cell<br>
                <strong>To:</strong> BLUE Team<br>
                <strong>Title:</strong> ${item.title || 'Feedback'}<br>
                <strong>Message:</strong> ${item.content}
            `;
        } else if (item.type === 'requestinfo') {
            contentHtml = `
                <strong>From:</strong> BLUE Team<br>
                <strong>To:</strong> WHITE Cell<br>
                <strong>Request:</strong> ${item.content}
            `;
        }

        return `
                <div class="timeline-item ${item.type}">
                    <div class="timeline-header">
                        <span class="timeline-time">Phase ${item.phase} | ${item.time}${item.faction ? ' | ' + item.faction.toUpperCase() : ''}</span>
                        <span class="timeline-type ${item.type}">${item.type === 'requestinfo' ? 'Info Request' : item.type === 'analysis' ? 'Analysis' : item.type === 'white_feedback' ? 'White Cell Feedback' : item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
                    </div>
                    <div class="timeline-content">${contentHtml}</div>
                </div>
            `;
    }).join('');
}

// Timeline Filtering
document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const filter = btn.getAttribute('data-filter');
        const items = document.querySelectorAll('.timeline-item');
        items.forEach(item => {
            if (filter === 'all' || item.classList.contains(filter)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
});

// Quick buttons for forms
document.querySelectorAll('.quick-btn[data-group]').forEach(btn => {
    btn.addEventListener('click', () => {
        const group = btn.getAttribute('data-group');
        document.querySelectorAll(`.quick-btn[data-group="${group}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});

// Scale sliders
document.getElementById('debateVsExecute').addEventListener('input', (e) => {
    document.getElementById('debateVsExecuteValue').textContent = e.target.value;
});

document.getElementById('debateIntensity').addEventListener('input', (e) => {
    document.getElementById('debateValue').textContent = e.target.value;
});

document.getElementById('coalitionImpact').addEventListener('input', (e) => {
    document.getElementById('coalitionImpactValue').textContent = e.target.value;
});

// Debounce function for auto-save
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounced save functions for analysis sections
const debouncedSaveDynamics = debounce(() => {
    saveData();
    addAnalysisToTimeline('dynamics');
}, 1000); // 1 second debounce

const debouncedSaveAlliance = debounce(() => {
    saveData();
    addAnalysisToTimeline('alliance');
}, 1000); // 1 second debounce

// Analysis section auto-save and timeline updates (debounced)
document.querySelectorAll('#dynamics input, #dynamics textarea, #dynamics select').forEach(el => {
    el.addEventListener('change', debouncedSaveDynamics);
});

document.querySelectorAll('#alliance input, #alliance textarea, #alliance select').forEach(el => {
    el.addEventListener('change', debouncedSaveAlliance);
});

// Badge updates
function updateBadges() {
    document.getElementById('timelineBadge').textContent = timelineItems.length;
}

// Update action count from facilitator
async function updateActionCount() {
    try {
        const facilitatorKey = (window.buildMoveKey && buildMoveKey(currentMove, 'facilitator')) || `actions_move_${currentMove}`;
        const facilitatorData = localStorage.getItem(facilitatorKey);
        const data = facilitatorData ? JSON.parse(facilitatorData) : null;
        const count = data?.actions?.length || 0;
        document.getElementById('actionsBadge').textContent = count;

        const container = document.getElementById('facilitatorActions');
        if (data && data.actions && data.actions.length > 0) {
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
            container.innerHTML = data.actions.map((a, i) => `
                        <div class="action-item">
                            <div class="action-header">
                                <span class="action-number">Action ${i + 1}</span>
                                <span>${a.timestamp || ''}</span>
                            </div>
                            <div><strong>Mechanism:</strong> ${mechanismNames[a.mechanism] || a.mechanism || ''}</div>
                            <div><strong>Sector:</strong> ${sectorNames[a.sector] || a.sector || ''}</div>
                            <div><strong>Targets:</strong> ${(a.targets || []).join(', ').toUpperCase()}</div>
                            <div><strong>Type of Exposure:</strong> ${exposureNames[a.exposure] || a.exposure || ''}</div>
                            <div><strong>Goal:</strong> ${a.goal || ''}</div>
                            <div><strong>Expected Outcomes:</strong> ${a.outcomes || ''}</div>
                            <div><strong>Ally Contingencies:</strong> ${a.contingencies || ''}</div>
                        </div>
                    `).join('');
            return;
        }
    } catch (error) {
        console.error('Error loading facilitator data:', error);
        const facilitatorKey = (window.buildMoveKey && buildMoveKey(currentMove, 'facilitator')) || `actions_move_${currentMove}`;
        const facilitatorData = localStorage.getItem(facilitatorKey);
        const count = facilitatorData ? JSON.parse(facilitatorData).actions?.length || 0 : 0;
        document.getElementById('actionsBadge').textContent = count;

        const container = document.getElementById('facilitatorActions');
        if (facilitatorData) {
            const data = JSON.parse(facilitatorData);
            if (data.actions && data.actions.length > 0) {
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
                container.innerHTML = data.actions.map((a, i) => `
                            <div class="action-item">
                                <div class="action-header">
                                    <span class="action-number">Action ${i + 1}</span>
                                    <span>${a.timestamp || ''}</span>
                                </div>
                                <div><strong>Mechanism:</strong> ${mechanismNames[a.mechanism] || a.mechanism || ''}</div>
                                <div><strong>Sector:</strong> ${sectorNames[a.sector] || a.sector || ''}</div>
                                <div><strong>Targets:</strong> ${(a.targets || []).join(', ').toUpperCase()}</div>
                                <div><strong>Type of Exposure:</strong> ${exposureNames[a.exposure] || a.exposure || ''}</div>
                                <div><strong>Goal:</strong> ${a.goal || ''}</div>
                                <div><strong>Expected Outcomes:</strong> ${a.outcomes || ''}</div>
                                <div><strong>Ally Contingencies:</strong> ${a.contingencies || ''}</div>
                            </div>
                        `).join('');
                return;
            }
        }
    }
    const container = document.getElementById('facilitatorActions');
    container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    <p>No actions submitted via Facilitator yet</p>
                    <p>Actions will appear here when submitted</p>
                </div>
            `;
}

// Data persistence
async function saveData() {
    if (isResetting) return;
    const data = {
        phase: currentPhase,
        timelineItems: timelineItems,
        leader: document.querySelector('.quick-btn[data-group="leader"].selected')?.getAttribute('data-value'),
        leadershipNotes: document.getElementById('leadershipNotes')?.value,
        decisionStyle: document.getElementById('decisionStyle')?.value,
        debateVsExecute: document.getElementById('debateVsExecute')?.value,
        disagreements: document.getElementById('disagreements')?.value,
        debateIntensity: document.getElementById('debateIntensity')?.value,
        consensus: document.getElementById('consensus')?.value,
        powersave: document.querySelector('.quick-btn[data-group="powersave"].selected')?.getAttribute('data-value'),
        powerStrategy: document.getElementById('powerStrategy')?.value,

        manualActions: document.getElementById('manualActions')?.value,
        allyFeedback: document.getElementById('allyFeedback')?.value,
        'ally-impact': document.querySelector('.quick-btn[data-group="ally-impact"].selected')?.getAttribute('data-value'),
        blueReactionAllies: document.getElementById('blueReactionAllies')?.value,
        allyBasedChanges: document.getElementById('allyBasedChanges')?.value,
        coalitionImpact: document.getElementById('coalitionImpact')?.value,
        redReports: document.getElementById('redReports')?.value,
        blueRedAssessment: document.getElementById('blueRedAssessment')?.value,
        'red-impact': document.querySelector('.quick-btn[data-group="red-impact"].selected')?.getAttribute('data-value'),
        redCounterActions: document.getElementById('redCounterActions')?.value,
        whiteOutcomes: document.getElementById('whiteOutcomes')?.value,
        blueReactionOutcomes: document.getElementById('blueReactionOutcomes')?.value,
        gameState: document.getElementById('gameState')?.value
    };

    // Save to localStorage
    try {
        const key = getNotetakerKey();
        if (!safeSetItem(key, data)) {
            throw new Error('Failed to save data to storage');
        }

        // Auto-save to data_storage folder (throttled - only every 30 seconds)
        if (typeof autoSaveNotetakerData === 'function') {
            const lastSave = localStorage.getItem(`lastAutoSave_notetaker_${currentMove}`);
            const now = Date.now();
            if (!lastSave || (now - parseInt(lastSave)) > 30000) {
                autoSaveNotetakerData && autoSaveNotetakerData(undefined, currentMove);
                localStorage.setItem(`lastAutoSave_notetaker_${currentMove}`, now.toString());
            }
        }
    } catch (e) {
        console.error('Failed to save notes data:', e);
        if (e.name === 'QuotaExceededError') {
            alert('Browser storage is full. Please clear some data or use a different browser.');
        } else {
            alert('Failed to save data. Please try again.');
        }
        showToast('Error saving data');
    }
}

async function loadData() {
    // Load from localStorage with validation
    let data = safeGetItem(getNotetakerKey(), null);

    if (!data) {
        data = safeGetItem(`notes_move_${currentMove}`, null);
    }

    if (!data) {
        // Try legacy key
        const legacyKey = `blueFacilitatorMove${currentMove}`;
        data = safeGetItem(legacyKey, null);
    }

    if (!data) {
        timelineItems = [];
        updateTimeline();
        updateBadges();
        return;
    }

    // Validate data structure with strict validation
    const schema = {
        timelineItems: { type: 'array', required: false, default: [] },
        phase: { type: 'number', required: false, default: currentPhase }
    };

    const validated = validateDataStrict(data, schema, false);
    if (!validated) {
        console.warn('Data validation failed, using empty data');
        showToast('Data validation failed - some data may be missing');
        data = { timelineItems: [], phase: currentPhase };
    } else {
        data = validated;
    }

    timelineItems = data.timelineItems || [];
    // Merge BLUE facilitator info requests, actions, and observations into timeline
    try {
        const facilitatorData = safeGetItem((window.buildMoveKey && buildMoveKey(currentMove, 'facilitator')) || `actions_move_${currentMove}`, null);
        // Try move-only key
        let reqData = facilitatorData?.infoRequests || safeGetItem(getRequestsKey(), null);
        if (reqData) {
            const parsed = Array.isArray(reqData) ? reqData : (reqData.requests || []);
            const mapped = parsed.map((r, idx) => ({
                type: 'requestinfo',
                content: r.details || r.text || r.query_text || '',
                phase: r.phase || currentPhase,
                time: new Date(r.timestamp || Date.now()).toLocaleTimeString(),
                timestamp: r.id || Date.now(),
                faction: 'blue'
            }));
            timelineItems = mapped.concat(timelineItems);
        }

        // Merge facilitator actions
        if (facilitatorData && facilitatorData.actions && Array.isArray(facilitatorData.actions)) {
            const actionItems = facilitatorData.actions.map(action => ({
                type: 'action',
                content: `Action ${action.number || ''}: ${action.goal || 'No goal specified'}`,
                phase: action.phase || currentPhase,
                time: action.timestamp || new Date().toLocaleTimeString(),
                timestamp: action.id || Date.now(),
                faction: 'blue'
            }));
            timelineItems = actionItems.concat(timelineItems);
        }

        // Merge facilitator observations
        if (facilitatorData && facilitatorData.observations && Array.isArray(facilitatorData.observations)) {
            const observationItems = facilitatorData.observations.map(obs => ({
                type: 'observation',
                content: `${obs.category || 'Observation'}: ${obs.text || ''}`,
                phase: obs.phase || currentPhase,
                time: obs.timestamp || new Date().toLocaleTimeString(),
                timestamp: obs.id || Date.now(),
                faction: 'blue'
            }));
            timelineItems = observationItems.concat(timelineItems);
        }
    } catch (e) {
        console.error('Error merging facilitator data into timeline:', e);
        // Continue without merging - not critical
    }
    updateTimeline();
    updateBadges();

    if (data.phase) {
        currentPhase = data.phase;
        document.querySelectorAll('.phase-btn').forEach(btn => {
            if (parseInt(btn.getAttribute('data-phase')) === currentPhase) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        updatePhaseGuidance();
    }

    const textFields = ['leadershipNotes', 'disagreements', 'consensus',
        'powerStrategy', 'efficiencyNotes', 'manualActions', 'allyFeedback', 'blueReactionAllies', 'allyBasedChanges',
        'redReports', 'blueRedAssessment', 'redCounterActions', 'whiteOutcomes', 'blueReactionOutcomes', 'gameState'];

    textFields.forEach(field => {
        const el = document.getElementById(field);
        if (el && data[field]) el.value = data[field];
    });

    const numFields = [];
    numFields.forEach(field => {
        const el = document.getElementById(field);
        if (el && data[field]) el.value = data[field];
    });

    const selectFields = ['decisionStyle'];
    selectFields.forEach(field => {
        const el = document.getElementById(field);
        if (el && data[field]) el.value = data[field];
    });

    const sliderFields = ['debateVsExecute', 'debateIntensity', 'coalitionImpact'];
    sliderFields.forEach(field => {
        const el = document.getElementById(field);
        if (el && data[field]) {
            el.value = data[field];
            const valueEl = document.getElementById(field + 'Value') || document.getElementById('debateValue');
            if (valueEl) valueEl.textContent = data[field];
        }
    });

    const buttonGroups = ['leader', 'powersave', 'ally-impact', 'red-impact'];
    buttonGroups.forEach(group => {
        if (data[group]) {
            document.querySelectorAll(`.quick-btn[data-group="${group}"]`).forEach(btn => {
                if (btn.getAttribute('data-value') === data[group]) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    });
}

async function exportNotes() {
    try {
        await saveData();

        const moves = {};
        const allTimelineItems = [];
        const facilitatorActions = {};

        for (let i = 1; i <= 3; i++) {
            const notesKey = (window.buildMoveKey && buildMoveKey(i, 'notetaker')) || `notes_move_${i}`;
            const data = safeGetItem(notesKey, null);
            if (data) {
                moves[i] = data;
            }

            // Include facilitator actions for context
            const facKey = (window.buildMoveKey && buildMoveKey(i, 'facilitator')) || `actions_move_${i}`;
            const facilitatorData = safeGetItem(facKey, null);
            if (facilitatorData && facilitatorData.actions) {
                facilitatorActions[i] = facilitatorData.actions;
            }

            // Include timeline items from shared storage
            const timelineKey = (window.buildMoveKey && buildMoveKey(i, 'whitecell')) || `whiteCell_move_${i}`;
            const timelineData = safeGetItem(timelineKey, {});
            if (timelineData.timelineItems && Array.isArray(timelineData.timelineItems)) {
                const blueItems = timelineData.timelineItems.filter(item =>
                    item.team === 'blue' || item.team === 'BLUE'
                );
                allTimelineItems.push(...blueItems.map(item => ({ ...item, move: i })));
            }
        }

        if (Object.keys(moves).length === 0) {
            alert('No data to export. Please add some notes first.');
            return;
        }

        const exportData = {
            exported: new Date().toISOString(),
            exportedBy: 'BLUE Team Notetaker',
            gameMetadata: {
                totalMoves: 3,
                currentMove: currentMove,
                currentPhase: currentPhase
            },
            allMoves: moves,
            facilitatorActions: facilitatorActions,
            timelineItems: allTimelineItems,
            decisionTimeline: buildDecisionTimeline(moves),
            teamDynamics: buildTeamDynamicsReport(moves),
            allianceEngagement: buildAllianceReport(moves),
            factionAnalysis: buildFactionAnalysis(moves),
            metadata: {
                exportVersion: '1.0',
                includesFacilitatorActions: true,
                includesTimeline: true
            }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
        a.download = `BLUE_notetaker_${timestamp}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Export complete. All Team Dynamics and Alliance Engagement data included.');
    } catch (error) {
        console.error('Error exporting notes:', error);
        alert(`Error exporting data: ${error.message || 'Unknown error'}`);
        showToast('Export failed');
    }
}

// Make functions globally available for inline handlers
window.changeMoveContext = changeMoveContext;
window.insertTemplate = insertTemplate;
window.addCapture = addCapture;
window.submitTeamDynamics = submitTeamDynamics;
window.submitAllianceEngagement = submitAllianceEngagement;
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

function buildTeamDynamicsReport(moves) {
    const report = {};
    for (let move in moves) {
        const data = moves[move];
        report[move] = {
            leadership: {
                primaryLeader: data.leader || 'Not recorded',
                leadershipNotes: data.leadershipNotes || '',
                decisionStyle: data.decisionStyle || 'Not recorded'
            },
            dividedGovernment: {
                mainDisagreements: data.disagreements || '',
                debateIntensity: data.debateIntensity || 5,
                consensusMethod: data.consensus || ''
            },


            powerManagement: {
                savingForLater: data.powersave || 'Not discussed',
                strategy: data.powerStrategy || ''
            },
            efficiency: {
                // Removed efficiency metrics per request
            },
            scales: {
                debateVsExecute: data.debateVsExecute || 5
            }
        };
    }
    return report;
}

// Submit functions for analysis sections
function submitTeamDynamics() {
    saveData();
    addAnalysisToTimeline('dynamics');
    alert('Team Dynamics analysis submitted and added to timeline.');
}

function submitAllianceEngagement() {
    saveData();
    addAnalysisToTimeline('alliance');
    alert('Alliance Engagement analysis submitted and added to timeline.');
}

function buildAllianceReport(moves) {
    const report = {};
    for (let move in moves) {
        const data = moves[move];
        report[move] = {
            allyResponses: {
                feedback: data.allyFeedback || '',
                impactOnActions: data['ally-impact'] || 'Not recorded',
                blueReaction: data.blueReactionAllies || '',
                changesMade: data.allyBasedChanges || '',
                coalitionImpact: data.coalitionImpact || 5
            },
            redActivity: {
                reportsHeard: data.redReports || '',
                blueAssessment: data.blueRedAssessment || '',
                triggeredChanges: data['red-impact'] || 'Not recorded',
                counterActions: data.redCounterActions || ''
            },
            outcomes: {
                whiteCellFeedback: data.whiteOutcomes || '',
                blueReaction: data.blueReactionOutcomes || ''
            },
            gameState: {
                updates: data.gameState || ''
            }
        };
    }
    return report;
}

function buildFactionAnalysis(moves) {
    const analysis = {};
    for (let move in moves) {
        const data = moves[move];
        analysis[move] = {
            leadership: data.leader || 'Not recorded',
            decisionStyle: data.decisionStyle || 'Not recorded',
            debateIntensity: data.debateIntensity || 'Not recorded',
            debateVsExecute: data.debateVsExecute || 'Not recorded'
        };
    }
    return analysis;
}

// Use shared showToast from data-layer.js

async function submitNotes() {
    let loadingStop = null;
    try {
        const submitButton = document.querySelector('button[onclick*="submitNotes"]');
        if (submitButton && typeof setButtonLoading === 'function') {
            loadingStop = setButtonLoading(submitButton, 'Submitting...');
        }

        await saveData();
        const data = safeGetItem(`notes_move_${currentMove}`, null);

        if (!data) {
            alert('No data to submit. Please add some notes before submitting.');
            if (loadingStop && typeof loadingStop === 'function') loadingStop();
            return;
        }

        const timelineCount = data.timelineItems?.length || 0;
        const hasDynamics = data.leader || data.decisionStyle || data.disagreements;
        const hasAlliance = data.allyFeedback || data.redReports || data.whiteOutcomes;

        let summary = `Submit Move ${currentMove} to WHITE Cell?\n\n`;
        summary += `Timeline items: ${timelineCount}\n`;
        summary += `Team Dynamics: ${hasDynamics ? 'Documented' : 'Incomplete'}\n`;
        summary += `Alliance Engagement: ${hasAlliance ? 'Documented' : 'Incomplete'}\n\n`;
        summary += `This will mark data as final and ready for WHITE Cell review.`;

        if (confirm(summary)) {
            data.submitted = true;
            data.submittedAt = new Date().toISOString();
            data.submittedBy = 'BLUE Team Notetaker';

            // Save to localStorage (use separate key for notetaker submissions)
            if (!safeSetItem(`blueNotesSubmission_move_${currentMove}`, data)) {
                throw new Error('Failed to save submission data');
            }

            // Append canonical timeline event
            try {
                appendTimelineItem(currentMove, {
                    phase: currentPhase, // Store as number, mapPhaseEnum is for display only
                    type: 'request',
                    title: `Notetaker submitted notes (timeline ${timelineCount})`,
                    content: 'Notes ready for WHITE review',
                    team: 'blue',
                    refs: { submittedBy: 'notetaker', timelineCount }
                });
            } catch (e) {
                console.error('Error appending timeline item:', e);
            }

            // Export file for backup
            try {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `BLUE_Move${currentMove}_Submitted_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                console.error('Error creating export file:', e);
                // Continue even if export fails
            }

            // Auto-save to data_storage
            if (typeof autoSaveTeamSubmission === 'function') {
                await autoSaveTeamSubmission(undefined, currentMove, 'notes');
            }
            if (typeof autoSaveNotetakerData === 'function') {
                await autoSaveNotetakerData(undefined, currentMove);
            }

            showToast(`Successfully submitted notes to WHITE Cell`);
            if (loadingStop && typeof loadingStop === 'function') loadingStop();
        } else {
            if (loadingStop && typeof loadingStop === 'function') loadingStop();
        }
    } catch (error) {
        console.error('Error submitting notes:', error);
        const errorMsg = error.message || error.toString() || 'Unknown error';
        alert(`Error submitting data: ${errorMsg}. Please try again.`);
        showToast('Submission failed - please try again');
        if (loadingStop && typeof loadingStop === 'function') loadingStop();
    }
}

// Make function globally available
window.submitNotes = submitNotes;

// ==========================================
// MEDIUM-4: MOVE COMPLETION SUBMISSION
// ==========================================

/**
 * Submit move completion to mark the move as finished
 * Tracks when the team has completed work on a move
 */
async function submitMoveCompletion() {
    if (!hasUtil || !currentSessionId) {
        showToast('Database not available. Please join a session first.', 3000);
        return;
    }

    const confirmSubmit = window.showConfirmModal
        ? await window.showConfirmModal(
            `Submit Move ${currentMove} as complete?<br><br>This indicates the team has finished this move.`,
            'Submit Move Completion',
            { type: 'default', confirmText: 'Submit', cancelText: 'Cancel' }
        )
        : confirm(`Submit Move ${currentMove} as complete?\n\nThis indicates the team has finished this move.`);

    if (!confirmSubmit) return;

    try {
        // Gather metadata about the move
        const actions = await window.esg.fetchActions(currentMove);
        const timeline = await window.esg.fetchTimeline(currentMove);

        const metadata = {
            actionCount: actions?.length || 0,
            timelineCount: timeline?.length || 0,
            completedByRole: 'notetaker'
        };

        // Submit completion
        const success = await window.esg.submitMoveCompletion(currentMove, metadata);

        if (success !== false) {
            showToast(`Move ${currentMove} marked as complete`, 3000);
        } else {
            showToast('Failed to submit move completion', 3000);
        }
    } catch (error) {
        console.error('Error submitting move completion:', error);
        showToast('Error submitting move completion', 3000);
    }
}

// Make function globally available
window.submitMoveCompletion = submitMoveCompletion;

// Make addCapture globally available
window.addCapture = addCapture;

// Use shared mapPhaseEnum and appendTimelineItem from data-layer.js

// Session picker removed

// Disable move selector
function disableMoveSelector() {
    const moveSelector = document.getElementById('moveSelector');
    if (moveSelector) {
        moveSelector.disabled = true;
        moveSelector.style.opacity = '0.6';
        moveSelector.style.cursor = 'not-allowed';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableMoveSelector);
} else {
    disableMoveSelector();
}

// Poll for game state updates every second
setInterval(updateGameStateFromShared, 1000);

// Initialize Session & Database Integration
async function initializeNotetaker() {
    // Check if data-layer.js is available
    if (hasUtil) {
        // Check for existing session
        currentSessionId = sessionStorage.getItem('esg_session_id');
        if (currentSessionId) {
            // Update last_seen in session metadata
            try {
                const currentMetadata = await window.esg.getSessionMetadata();
                const participants = currentMetadata?.participants || {};
                const clientId = sessionStorage.getItem('esg_client_id');
                const role = sessionStorage.getItem('esg_role') || 'blue_notetaker';

                if (clientId) {
                    participants[clientId] = {
                        ...participants[clientId],
                        role: role,
                        last_seen: new Date().toISOString(),
                        joined_at: participants[clientId]?.joined_at || new Date().toISOString()
                    };
                    await window.esg.updateSessionMetadata({ participants });
                }
            } catch (error) {
                console.error('Error updating participant status:', error);
            }

            await updateSessionStatus();
            await loadDataFromDatabase();
            setupRealtimeSubscriptions();
        } else {
            // Show session join prompt
            showSessionJoinPrompt();
        }

        // Subscribe to game state changes
        window.esg.subscribeToGameState((newState) => {
            if (newState) {
                if (newState.move !== currentMove) {
                    currentMove = newState.move;
                    const moveSelector = document.getElementById('moveSelector');
                    if (moveSelector) moveSelector.value = currentMove;
                    document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];
                    loadDataFromDatabase();
                }
                if (newState.phase !== currentPhase) {
                    currentPhase = newState.phase;
                    updatePhaseGuidance();
                    syncPhaseButtons();
                }
            }
        });
    } else {
        // Fallback to localStorage mode
        updateGameStateFromShared();
        loadData();
    }
}

async function updateSessionStatus() {
    const statusEl = document.getElementById('sessionStatus');
    if (statusEl && currentSessionId) {
        // Fetch session name from database
        if (typeof window.esg !== 'undefined' && window.esg.getSessionName) {
            try {
                const sessionName = await window.esg.getSessionName();
                if (sessionName) {
                    statusEl.textContent = sessionName;
                    statusEl.style.color = '#28a745';
                } else {
                    statusEl.textContent = `Session: ${currentSessionId.substring(0, 8)}...`;
                    statusEl.style.color = '#28a745';
                }
            } catch (error) {
                console.error('Error fetching session name:', error);
                statusEl.textContent = `Session: ${currentSessionId.substring(0, 8)}...`;
                statusEl.style.color = '#28a745';
            }
        } else {
            statusEl.textContent = `Session: ${currentSessionId.substring(0, 8)}...`;
            statusEl.style.color = '#28a745';
        }
    }
}

function showSessionJoinPrompt() {
    const statusEl = document.getElementById('sessionStatus');
    if (statusEl) {
        statusEl.textContent = 'Not connected - Enter Session ID above';
        statusEl.style.color = '#dc3545';
    }
    const sessionControl = document.getElementById('sessionControlGroup');
    if (sessionControl) sessionControl.style.display = 'flex';
}

async function joinSessionFromNotetaker() {
    if (!hasUtil) {
        alert('Database connection not available.');
        return;
    }

    const input = document.getElementById('sessionIdInput');
    const sessionId = input ? input.value.trim() : '';

    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }

    try {
        const success = await window.esg.joinSession(sessionId);
        if (success) {
            currentSessionId = sessionId;
            await updateSessionStatus();
            await loadDataFromDatabase();
            setupRealtimeSubscriptions();
            const sessionControl = document.getElementById('sessionControlGroup');
            if (sessionControl) sessionControl.style.display = 'none';
            if (window.esg.showToast) window.esg.showToast('Joined session successfully');
        } else {
            alert('Failed to join session. Please check the session ID.');
        }
    } catch (error) {
        console.error('Join session error:', error);
        alert('Failed to join session: ' + error.message);
    }
}

window.joinSessionFromNotetaker = joinSessionFromNotetaker;

async function loadDataFromDatabase() {
    if (!hasUtil || !currentSessionId) {
        loadData(); // Fallback to localStorage
        return;
    }

    try {
        // Load game state
        const gameState = await window.esg.fetchGameState();
        if (gameState) {
            currentMove = gameState.move || currentMove;
            currentPhase = gameState.phase || currentPhase;
            const moveSelector = document.getElementById('moveSelector');
            if (moveSelector) moveSelector.value = currentMove;
            document.getElementById('moveEpoch').textContent = moveEpochs[currentMove];
            syncPhaseButtons();
            updatePhaseGuidance();
        }

        // Load timeline from database
        const dbTimeline = await window.esg.fetchTimeline(currentMove);
        if (dbTimeline && dbTimeline.length > 0) {
            timelineItems = dbTimeline.map(item => ({
                id: item.id,
                type: item.type,
                content: item.content,
                phase: item.phase || currentPhase,
                time: new Date(item.created_at).toLocaleTimeString(),
                timestamp: new Date(item.created_at).getTime(),
                team: item.team,
                marker: item.debate_marker,
                author_faction: item.faction_tag
            }));
        } else {
            // Fallback to localStorage
            loadData();
        }

        // Also load actions/requests to show in timeline
        const dbActions = await window.esg.fetchActions(currentMove);
        const dbRequests = await window.esg.fetchRequests();

        // Merge database items into timeline
        if (dbActions && dbActions.length > 0) {
            dbActions.forEach(action => {
                const exists = timelineItems.some(t => t.id === action.id || (t.content && t.content.includes(action.mechanism)));
                if (!exists) {
                    timelineItems.push({
                        id: action.id,
                        type: 'action',
                        content: `${action.mechanism} (${action.sector}): ${action.goal}`,
                        phase: action.phase || currentPhase,
                        time: new Date(action.created_at).toLocaleTimeString(),
                        timestamp: new Date(action.created_at).getTime(),
                        team: 'blue'
                    });
                }
            });
        }

        if (dbRequests && dbRequests.length > 0) {
            dbRequests.forEach(req => {
                const exists = timelineItems.some(t => t.id === req.id || (t.content && t.content.includes(req.query?.substring(0, 20))));
                if (!exists) {
                    timelineItems.push({
                        id: req.id,
                        type: 'requestinfo',
                        content: `RFI: ${req.query}`,
                        phase: req.phase || currentPhase,
                        time: new Date(req.created_at).toLocaleTimeString(),
                        timestamp: new Date(req.created_at).getTime(),
                        team: 'blue'
                    });
                }
            });
        }

        updateTimeline();
        updateActionCount();
    } catch (error) {
        console.error('Load data from database error:', error);
        loadData(); // Fallback to localStorage
    }
}

function setupRealtimeSubscriptions() {
    if (!hasUtil || !currentSessionId) return;

    // Subscribe to timeline
    window.esg.subscribeToTimeline((item) => {
        // Add new timeline item
        const exists = timelineItems.some(t => t.id === item.id || (t.timestamp && item.created_at && Math.abs(t.timestamp - new Date(item.created_at).getTime()) < 1000));
        if (!exists) {
            timelineItems.push({
                id: item.id,
                type: item.type,
                content: item.content,
                phase: item.phase || currentPhase,
                time: new Date(item.created_at || Date.now()).toLocaleTimeString(),
                timestamp: new Date(item.created_at || Date.now()).getTime(),
                team: item.team
            });
            updateTimeline();
        }
    });

    // Subscribe to actions
    window.esg.subscribeToActions((payload) => {
        const eventType = payload.eventType || (payload.new ? 'UPDATE' : 'INSERT');
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            loadDataFromDatabase();
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeNotetaker();

    // CRITICAL-5: Start heartbeat system
    if (window.researchTracking && window.researchTracking.startParticipantHeartbeat) {
        window.researchTracking.startParticipantHeartbeat();
    }
});

updateTimer();
updatePhaseGuidance();
updateActionCount();

// Standardized loader hide
window.addEventListener('load', function () {
    setTimeout(function () {
        const loader = document.getElementById('loader');
        if (loader && !loader.classList.contains('hidden')) {
            loader.classList.add('hidden');
        }
    }, 1500);
});

window.addEventListener('blueDecisionAdded', (e) => {
    if (e.detail.move === currentMove) {
        updateActionCount();
    }
});

// Flag to prevent saving during reset
let isResetting = false;

window.addEventListener('storage', (e) => {
    // Check for full wipe (key is null)
    if (e.key === null) {
        console.log('Storage cleared, reloading...');
        isResetting = true;
        window.location.reload();
        return;
    }

    if (e.key && e.key.startsWith('blueFacilitatorMove')) {
        updateActionCount();
    }
    // Listen for game state changes from White Cell (move/phase)
    if (e.key === getSharedGameStateKey() || e.key === 'sharedGameState') {
        updateGameStateFromShared();
    }
});

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
            phase: currentPhase,
            timelineItems: timelineItems,
            leader: document.querySelector('.quick-btn[data-group="leader"].selected')?.getAttribute('data-value'),
            leadershipNotes: document.getElementById('leadershipNotes')?.value,
            decisionStyle: document.getElementById('decisionStyle')?.value,
            debateVsExecute: document.getElementById('debateVsExecute')?.value,
            disagreements: document.getElementById('disagreements')?.value,
            debateIntensity: document.getElementById('debateIntensity')?.value,
            consensus: document.getElementById('consensus')?.value,
            powersave: document.querySelector('.quick-btn[data-group="powersave"].selected')?.getAttribute('data-value'),
            powerStrategy: document.getElementById('powerStrategy')?.value,
            manualActions: document.getElementById('manualActions')?.value,
            allyFeedback: document.getElementById('allyFeedback')?.value,
            'ally-impact': document.querySelector('.quick-btn[data-group="ally-impact"].selected')?.getAttribute('data-value'),
            blueReactionAllies: document.getElementById('blueReactionAllies')?.value,
            allyBasedChanges: document.getElementById('allyBasedChanges')?.value,
            coalitionImpact: document.getElementById('coalitionImpact')?.value,
            redReports: document.getElementById('redReports')?.value,
            blueRedAssessment: document.getElementById('blueRedAssessment')?.value,
            'red-impact': document.querySelector('.quick-btn[data-group="red-impact"].selected')?.getAttribute('data-value'),
            redCounterActions: document.getElementById('redCounterActions')?.value,
            whiteOutcomes: document.getElementById('whiteOutcomes')?.value,
            blueReactionOutcomes: document.getElementById('blueReactionOutcomes')?.value,
            gameState: document.getElementById('gameState')?.value
        };
        // Synchronous localStorage write
        const key = `notes_move_${currentMove}`;
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Error in beforeunload save:', e);
    }
});
