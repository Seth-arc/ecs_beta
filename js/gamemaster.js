// gamemaster.js - Updated to use data-layer.js (Supabase integration)

// 1. STATE MANAGEMENT
let currentMove = 1;
let currentPhase = 1;
let timerInterval = null;
let timerSeconds = 90 * 60; // Default 90 mins
let currentActionId = null; // For adjudication modal
let currentRequestId = null; // For response modal
const moveEpochs = {
    1: 'Epoch 1 (2027-2030)',
    2: 'Epoch 2 (2030-2032)',
    3: 'Epoch 3 (2032-2034)'
};

const SHARED_STATE_KEY = (window.STORAGE_KEYS && STORAGE_KEYS.sharedState) || 'sharedGameState';
const SHARED_TIMER_KEY = (window.STORAGE_KEYS && STORAGE_KEYS.sharedTimer) || 'sharedTimer';

// Check if data-layer is available
const hasUtil = typeof window.esg !== 'undefined';

// Helper function to read from localStorage
function readStore(key, fallback) {
    try {
        if (typeof safeGetItem === 'function') {
            return safeGetItem(key, fallback);
        }
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.error('readStore error', key, e);
        return fallback;
    }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication (non-blocking)
    if (hasUtil) {
        const role = sessionStorage.getItem('esg_role');
        if (!role || role !== 'white') {
            console.warn('Not authenticated as white cell. Showing login prompt...');
            showLoginPrompt();
            // Don't return - allow page to load in limited mode
        } else {
            // Load session info (this will also load available sessions and selected session data)
            await loadSessionInfo();

            // Setup real-time subscriptions (will work once a session is selected)
            setupSubscriptions();
        }
    } else {
        // Fallback to localStorage mode
        loadGameState();
    }

    loadTimerState();
    startPolling();

    // Navigation Logic
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            const sectionId = item.getAttribute('data-section');
            document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(sectionId);
            if (targetSection) targetSection.classList.add('active');

            if (sectionId === 'timeline') renderTimeline();
            if (sectionId === 'actions') renderActions();
            if (sectionId === 'requests') renderRequests();
            if (sectionId === 'users') {
                // User management section doesn't need dynamic loading
            }
        });
    });

    // Timer Controls
    const startBtn = document.getElementById('startTimer');
    const pauseBtn = document.getElementById('pauseTimer');
    const resetBtn = document.getElementById('resetTimer');
    if (startBtn) startBtn.addEventListener('click', () => startTimer(true));
    if (pauseBtn) pauseBtn.addEventListener('click', () => startTimer(false));
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);

    // CRITICAL-5: Start heartbeat system
    if (window.researchTracking && window.researchTracking.startParticipantHeartbeat) {
        window.researchTracking.startParticipantHeartbeat();
    }
});

// CRITICAL-5: Stop heartbeat on page unload
window.addEventListener('beforeunload', () => {
    if (window.researchTracking && window.researchTracking.stopParticipantHeartbeat) {
        window.researchTracking.stopParticipantHeartbeat();
    }
});

// 2. AUTHENTICATION PROMPT

function showLoginPrompt() {
    // Create a login overlay
    const overlay = document.createElement('div');
    overlay.id = 'loginOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.2s ease;';

    overlay.innerHTML = `
        <div class="modal-content" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 2px 8px rgba(26, 68, 128, 0.04), 0 8px 32px rgba(26, 68, 128, 0.06); max-width: 450px; width: 90%; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; position: relative;" onclick="event.stopPropagation()">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #1a4480; border-radius: 12px 12px 0 0;"></div>
            <div style="padding: 24px 24px 16px; border-bottom: 1px solid #EDF2F7;">
                <h2 style="font-size: 1.15rem; font-weight: 400; color: #1C2331; margin: 0; letter-spacing: -0.01em;"></h2>
            </div>
            <div style="padding: 20px 24px;">
                <p style="color: #4A5568; margin-bottom: 20px; line-height: 1.6; font-size: 0.9375rem;">Please log in to access the Game Master Control Panel.</p>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1a1a1a; font-size: 0.875rem;">Password:</label>
                    <input type="password" id="loginPassword" 
                           style="width: 100%; padding: 12px 14px; border: 1px solid #EDF2F7; border-radius: 8px; box-sizing: border-box; font-size: 0.9375rem; font-family: 'Inter', sans-serif; background: #FAFAFA; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);"
                           onkeypress="if(event.key === 'Enter') attemptLogin()"
                           onfocus="this.style.borderColor='#1a4480'; this.style.boxShadow='0 0 0 3px rgba(26, 68, 128, 0.1)'; this.style.background='#FFFFFF'"
                           onblur="this.style.borderColor='#EDF2F7'; this.style.boxShadow='none'; this.style.background='#FAFAFA'">
                </div>
            </div>
            <div style="padding: 16px 24px 24px; border-top: 1px solid #EDF2F7; display: flex; gap: 12px; justify-content: flex-end;">
                <button onclick="closeLoginPrompt()" 
                        class="modal-btn-secondary"
                        style="padding: 12px 14px; border-radius: 8px; font-size: 0.875rem; font-weight: 500; font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid #EDF2F7; background: #FAFAFA; color: #1C2331; display: inline-flex; align-items: center; gap: 8px;">
                    Cancel
                </button>
                <button onclick="attemptLogin()" 
                        class="modal-btn-primary"
                        style="padding: 12px 14px; border-radius: 8px; font-size: 0.875rem; font-weight: 500; font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid #1a4480; background: #1a4480; color: white; display: inline-flex; align-items: center; gap: 8px;">
                    Login
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Focus password input
    setTimeout(() => {
        const passwordInput = document.getElementById('loginPassword');
        if (passwordInput) passwordInput.focus();
    }, 100);
}

function closeLoginPrompt(shouldRedirect = true) {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.remove();
    // Only redirect to home page if user cancels login (not on successful login)
    if (shouldRedirect) {
        window.location.href = 'index.html';
    }
}

async function attemptLogin() {
    if (!hasUtil) {
        alert('Database connection not available.');
        return;
    }

    const passwordInput = document.getElementById('loginPassword');
    const password = passwordInput ? passwordInput.value : '';

    if (!password) {
        alert('Please enter a password');
        return;
    }

    // Login with 'white' role and password 'admin2025' (from data-layer.js ROLES)
    const success = window.esg.login('white', password);

    if (success) {
        closeLoginPrompt(false); // Don't redirect on successful login
        window.esg.showToast('Logged in successfully');
        // Reload page functionality
        await loadSessionInfo();
        await loadGameStateFromDB();
        setupSubscriptions();
    } else {
        await showAlertModal('Invalid password. Please try again.', 'Authentication Failed');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
}

// Make functions globally available
window.closeLoginPrompt = closeLoginPrompt;
window.attemptLogin = attemptLogin;

// User Management Functions
function copyPassword(password, roleName) {
    navigator.clipboard.writeText(password).then(() => {
        window.esg.showToast(`${roleName} password copied to clipboard`);
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = password;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        window.esg.showToast(`${roleName} password copied to clipboard`);
    });
}

window.copyPassword = copyPassword;

// 3. SESSION MANAGEMENT

// Game Master session selection (no need to "join" - just select which session to manage)
let selectedSessionId = null;

async function loadSessionInfo() {
    if (!hasUtil) return;

    // For Game Master, we use "selectedSessionId" instead of requiring a "join"
    selectedSessionId = sessionStorage.getItem('esg_selected_session_id');
    const statusEl = document.getElementById('sessionStatus');
    const idEl = document.getElementById('sessionId');

    if (selectedSessionId) {
        // Verify session still exists
        try {
            const sessions = await window.esg.fetchAllSessions();
            const currentSession = sessions.find(s => s.id === selectedSessionId);
            if (currentSession) {
                if (statusEl) statusEl.textContent = `Managing session: ${currentSession.name || selectedSessionId}`;
                if (idEl) idEl.textContent = `Session ID: ${selectedSessionId}`;
            } else {
                // Session doesn't exist or was archived
                selectedSessionId = null;
                sessionStorage.removeItem('esg_selected_session_id');
                if (statusEl) statusEl.textContent = 'No session selected';
                if (idEl) idEl.textContent = '';
            }
        } catch (e) {
            if (statusEl) statusEl.textContent = `Managing session: ${selectedSessionId}`;
            if (idEl) idEl.textContent = `Session ID: ${selectedSessionId}`;
        }
    } else {
        if (statusEl) statusEl.textContent = 'No session selected - Select a session below to manage it';
        if (idEl) idEl.textContent = '';
    }

    // Load and display all available sessions
    await loadAvailableSessions();

    // If we have a selected session, load its data
    if (selectedSessionId) {
        await loadGameStateFromDB(selectedSessionId);
        await refreshParticipants(selectedSessionId);
    }
}

async function loadAvailableSessions() {
    if (!hasUtil) return;

    try {
        const sessions = await window.esg.fetchAllSessions();
        const container = document.getElementById('availableSessionsList');
        if (!container) return;

        if (sessions.length === 0) {
            container.innerHTML = '<div class="empty-state">No active sessions found. Create a new session to get started.</div>';
            return;
        }

        const currentSessionId = selectedSessionId || sessionStorage.getItem('esg_selected_session_id');

        container.innerHTML = sessions.map(session => {
            const isCurrent = session.id === currentSessionId;
            const createdDate = new Date(session.created_at).toLocaleString();
            // Escape quotes in session name for use in onclick attribute
            const sessionNameEscaped = (session.name || 'Unnamed Session').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
                <div class="session-item ${isCurrent ? 'active' : ''}" style="
                    padding: 12px;
                    border: 1px solid ${isCurrent ? '#1a4480' : '#ddd'};
                    border-radius: 6px;
                    margin-bottom: 10px;
                    background: ${isCurrent ? '#f0f7ff' : '#fff'};
                    cursor: pointer;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px;">
                                ${session.name || 'Unnamed Session'}
                                ${isCurrent ? '<span style="color: #1a4480; font-size: 0.85em; margin-left: 8px;">(Current)</span>' : ''}
                            </div>
                            <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">
                                ID: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">${session.id}</code>
                            </div>
                            <div style="font-size: 0.8em; color: #999;">
                                Created: ${createdDate}
                            </div>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            ${!isCurrent ? `
                                <button onclick="selectSession('${session.id}')" 
                                        style="padding: 6px 12px; background: #1a4480; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
                                    Select
                                </button>
                            ` : ''}
                            <button onclick="deleteSessionPrompt('${session.id}', '${sessionNameEscaped}')" 
                                    style="padding: 6px 12px; background: ${isCurrent ? '#dc3545' : '#6c757d'}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;"
                                    title="${isCurrent ? 'Leave session before deleting' : 'Delete session'}">
                                ${isCurrent ? 'Leave & Delete' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Load available sessions error:', error);
        const container = document.getElementById('availableSessionsList');
        if (container) {
            container.innerHTML = '<div class="empty-state">Error loading sessions. Please refresh the page.</div>';
        }
    }
}

async function selectSession(sessionId) {
    if (!hasUtil) {
        alert('Database connection not available.');
        return;
    }

    try {
        // Verify session exists
        const sessions = await window.esg.fetchAllSessions();
        const session = sessions.find(s => s.id === sessionId);

        if (!session) {
            await showAlertModal('Session not found or has been archived.', 'Session Not Found');
            await loadAvailableSessions();
            return;
        }

        // Select the session (Game Master doesn't need to "join")
        selectedSessionId = sessionId;
        sessionStorage.setItem('esg_selected_session_id', sessionId);

        // Also set it in data-layer.js context for functions that need it
        if (window.esg && window.esg.setCurrentSession) {
            window.esg.setCurrentSession(sessionId);
        }

        window.esg.showToast(`Now managing session: ${session.name || sessionId}`);
        await loadSessionInfo();
        await loadGameStateFromDB(sessionId);
        await refreshParticipants(sessionId);
        setupSubscriptions();
    } catch (error) {
        console.error('Select session error:', error);
        await showAlertModal('Failed to select session: ' + error.message, 'Error');
    }
}

window.selectSession = selectSession;
window.selectSessionById = selectSessionById;

async function deleteSessionPrompt(sessionId, sessionName) {
    if (!hasUtil) {
        await showAlertModal('Database connection not available.', 'Connection Error');
        return;
    }

    if (!sessionId) {
        await showAlertModal('No session ID provided.', 'Error');
        return;
    }

    const isCurrent = sessionId === (selectedSessionId || sessionStorage.getItem('esg_selected_session_id'));

    if (isCurrent) {
        const confirmLeave = await showConfirmModal(
            `You are currently managing this session. Do you want to stop managing and archive "${sessionName}"?<br><br>This will archive the session and all its data.`,
            'Archive Current Session',
            { type: 'danger', confirmText: 'Leave & Archive', cancelText: 'Cancel' }
        );
        if (!confirmLeave) return;

        // Clear the selected session
        selectedSessionId = null;
        sessionStorage.removeItem('esg_selected_session_id');
        if (window.esg && window.esg.setCurrentSession) {
            window.esg.setCurrentSession(null);
        }
    } else {
        const confirmDelete = await showConfirmModal(
            `Are you sure you want to archive "${sessionName}"?<br><br>This will archive the session and all its data. This action cannot be undone.`,
            'Archive Session',
            { type: 'danger', confirmText: 'Archive', cancelText: 'Cancel' }
        );
        if (!confirmDelete) return;
    }

    try {
        console.log('Attempting to delete session:', sessionId);
        const success = await window.esg.deleteSession(sessionId, false); // false = soft delete (archive)
        console.log('Delete session result:', success);

        if (success) {
            if (window.esg.showToast) {
                window.esg.showToast(`Session "${sessionName}" has been archived`);
            }
            await loadAvailableSessions();
            await loadSessionInfo(); // Refresh current session info

            if (isCurrent) {
                // If we deleted the selected session, clear the selection and reload state
                selectedSessionId = null;
                sessionStorage.removeItem('esg_selected_session_id');
                if (window.esg && window.esg.setCurrentSession) {
                    window.esg.setCurrentSession(null);
                }
                await loadGameStateFromDB();
                await refreshParticipants();
                setupSubscriptions(); // Re-setup subscriptions for no session
            }
        } else {
            // Check browser console for detailed error logs
            await showAlertModal(
                'Failed to archive session. Please check the browser console (F12) for details and try again.',
                'Archive Failed'
            );
        }
    } catch (error) {
        console.error('Delete session error:', error);
        console.error('Error stack:', error.stack);
        await showAlertModal(
            'Failed to archive session: ' + (error.message || 'Unknown error') +
            '\n\nPlease check the browser console (F12) for more details.',
            'Error'
        );
    }
}

window.deleteSessionPrompt = deleteSessionPrompt;

async function createNewSession() {
    if (!hasUtil) {
        await showAlertModal('Database connection not available. Please ensure data-layer.js is loaded.', 'Connection Error');
        return;
    }

    const nameInput = document.getElementById('newSessionName');
    const name = nameInput ? nameInput.value.trim() : `Session ${new Date().toISOString()}`;

    if (!name) {
        await showAlertModal('Please enter a session name', 'Session Name Required');
        if (nameInput) nameInput.focus();
        return;
    }

    try {
        const sessionId = await window.esg.createSession(name);
        if (sessionId) {
            // Automatically select the newly created session
            selectedSessionId = sessionId;
            sessionStorage.setItem('esg_selected_session_id', sessionId);
            if (window.esg && window.esg.setCurrentSession) {
                window.esg.setCurrentSession(sessionId);
            }

            window.esg.showToast(`Session "${name}" created and selected`);
            await loadSessionInfo();
            await loadGameStateFromDB(sessionId);
            await refreshParticipants(sessionId);
        } else {
            await showAlertModal('Failed to create session', 'Error');
        }
    } catch (error) {
        console.error('Create session error:', error);
        await showAlertModal('Failed to create session: ' + error.message, 'Error');
    }
}

async function selectSessionById() {
    if (!hasUtil) {
        await showAlertModal('Database connection not available. Please ensure data-layer.js is loaded.', 'Connection Error');
        return;
    }

    const idInput = document.getElementById('joinSessionId');
    const sessionId = idInput ? idInput.value.trim() : '';

    if (!sessionId) {
        await showAlertModal('Please enter a session ID', 'Session ID Required');
        if (idInput) idInput.focus();
        return;
    }

    await selectSession(sessionId);
    if (idInput) idInput.value = ''; // Clear the input
}

// Session Participants Management
async function refreshParticipants(sessionIdParam = null) {
    if (!hasUtil) return;
    const sessionId = sessionIdParam || selectedSessionId || sessionStorage.getItem('esg_selected_session_id');
    if (!sessionId) {
        const container = document.getElementById('sessionParticipants');
        if (container) {
            container.innerHTML = '<div class="empty-state">No session selected. Select a session above to view its participants.</div>';
        }
        return;
    }

    // Set context for data-layer.js functions
    if (window.esg && window.esg.setCurrentSession) {
        window.esg.setCurrentSession(sessionId);
    }

    try {
        // Get unique client IDs from all session data
        const [actions, requests, timeline] = await Promise.all([
            window.esg.fetchActions(1).catch(() => []),
            window.esg.fetchRequests().catch(() => []),
            window.esg.fetchTimeline().catch(() => [])
        ]);

        // Collect unique client IDs from actions, requests, and timeline
        const clientIds = new Set();
        (actions || []).forEach(a => { if (a.client_id) clientIds.add(a.client_id); });
        (requests || []).forEach(r => { if (r.client_id) clientIds.add(r.client_id); });
        (timeline || []).forEach(t => { if (t.client_id) clientIds.add(t.client_id); });

        // Get session metadata for participant notes and joined participants
        const metadata = await window.esg.getSessionMetadata() || {};
        const participantNotes = metadata.participants || {};

        // Debug logging
        console.log('Session metadata:', metadata);
        console.log('Participant notes:', participantNotes);
        console.log('Client IDs from actions/requests/timeline:', Array.from(clientIds));

        // Also include participants who have joined but haven't submitted anything yet
        Object.keys(participantNotes).forEach(clientId => {
            clientIds.add(clientId);
            console.log('Added participant from metadata:', clientId, participantNotes[clientId]);
        });

        console.log('Total client IDs after adding metadata:', Array.from(clientIds));

        // Render participants
        const container = document.getElementById('sessionParticipants');
        if (!container) return;

        if (clientIds.size === 0) {
            // Show debug info if no participants found
            const debugInfo = `
                <div class="empty-state">
                    <p>No participants yet. Users will appear here when they interact with the session.</p>
                    <details style="margin-top: 10px; font-size: 0.8rem; color: #666;">
                        <summary style="cursor: pointer;">Debug Info</summary>
                        <pre style="background: #f5f5f5; padding: 10px; margin-top: 5px; border-radius: 4px; overflow: auto; max-height: 200px;">
Actions: ${(actions || []).length}
Requests: ${(requests || []).length}
Timeline: ${(timeline || []).length}
Metadata participants: ${Object.keys(participantNotes).length}
Session ID: ${sessionId}
                        </pre>
                    </details>
                </div>
            `;
            container.innerHTML = debugInfo;
            return;
        }

        const participantsList = Array.from(clientIds).map(clientId => {
            const note = participantNotes[clientId] || {};
            const name = note.name || 'Unknown User';
            const role = note.role || 'participant';

            // Determine if this participant has submitted anything
            const hasActions = (actions || []).some(a => a.client_id === clientId);
            const hasRequests = (requests || []).some(r => r.client_id === clientId);
            const hasTimeline = (timeline || []).some(t => t.client_id === clientId);
            const hasActivity = hasActions || hasRequests || hasTimeline;

            // Format role display
            const roleDisplay = role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            // Show last seen time if available
            const lastSeen = note.last_seen ? new Date(note.last_seen).toLocaleString() : null;
            const joinedAt = note.joined_at ? new Date(note.joined_at).toLocaleString() : null;

            const displayName = name !== 'Unknown User' ? name : `${roleDisplay} (${clientId.substring(0, 8)}...)`;

            return `
                <div style="padding: 12px; background: #f8fafc; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid ${hasActivity ? '#1a4480' : '#94a3b8'};">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px;">${displayName}</div>
                            <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 4px;">
                                <span style="text-transform: capitalize;">${roleDisplay}</span>
                                ${!hasActivity ? ' <span style="color: #94a3b8; font-style: italic;">(Joined, no activity yet)</span>' : ''}
                            </div>
                            ${lastSeen ? `<div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 2px;">Last seen: ${lastSeen}</div>` : ''}
                            ${joinedAt ? `<div style="font-size: 0.75rem; color: #94a3b8;">Joined: ${joinedAt}</div>` : ''}
                            <div style="font-family: monospace; font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">
                                ID: ${clientId.substring(0, 8)}...
                            </div>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="editParticipantNote('${clientId}')" 
                                    style="padding: 4px 8px; background: #e2e8f0; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                                Edit
                            </button>
                            <button onclick="removeParticipant('${clientId}', '${(name !== 'Unknown User' ? name : roleDisplay).replace(/'/g, "\\'")}')" 
                                    style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;"
                                    title="Remove participant from session">
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = participantsList;
    } catch (error) {
        console.error('Refresh participants error:', error);
        const container = document.getElementById('sessionParticipants');
        if (container) {
            container.innerHTML = '<div class="empty-state">Error loading participants.</div>';
        }
    }
}

function showAddParticipantModal() {
    const modal = document.getElementById('participantModal');
    const clientIdInput = document.getElementById('participantClientId');
    const nameInput = document.getElementById('participantName');
    const roleSelect = document.getElementById('participantRole');
    const deleteBtn = document.getElementById('deleteParticipantBtn');
    const modalTitle = modal ? modal.querySelector('h2') : null;

    if (modal) {
        modal.style.display = 'block';
        if (clientIdInput) {
            clientIdInput.value = '';
            clientIdInput.readOnly = false;
        }
        if (nameInput) nameInput.value = '';
        if (roleSelect) roleSelect.value = '';
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
            deleteBtn.removeAttribute('data-client-id');
        }
        if (modalTitle) modalTitle.textContent = 'Add Participant Note';
    }
}

function closeParticipantModal() {
    const modal = document.getElementById('participantModal');
    const clientIdInput = document.getElementById('participantClientId');
    if (modal) modal.style.display = 'none';
    if (clientIdInput) clientIdInput.readOnly = false;
}

window.closeParticipantModal = closeParticipantModal;

function editParticipantNote(clientId) {
    showAddParticipantModal();
    const clientIdInput = document.getElementById('participantClientId');
    const deleteBtn = document.getElementById('deleteParticipantBtn');
    const modalTitle = document.querySelector('#participantModal h2');

    if (clientIdInput) {
        clientIdInput.value = clientId;
        clientIdInput.readOnly = true; // Make it read-only when editing
    }
    if (deleteBtn) {
        deleteBtn.style.display = 'block';
        deleteBtn.setAttribute('data-client-id', clientId);
    }
    if (modalTitle) modalTitle.textContent = 'Edit Participant Note';
}

function deleteParticipantFromModal() {
    const deleteBtn = document.getElementById('deleteParticipantBtn');
    const clientIdInput = document.getElementById('participantClientId');
    if (!deleteBtn || !clientIdInput) return;

    const clientId = deleteBtn.getAttribute('data-client-id') || clientIdInput.value.trim();
    if (!clientId) {
        alert('No client ID found');
        return;
    }

    // Get participant name if available
    const nameInput = document.getElementById('participantName');
    const participantName = nameInput ? nameInput.value.trim() : clientId.substring(0, 8);

    closeParticipantModal();
    removeParticipant(clientId, participantName);
}

async function removeParticipant(clientId, participantName) {
    if (!hasUtil) {
        alert('Database connection not available.');
        return;
    }

    const sessionId = selectedSessionId || sessionStorage.getItem('esg_selected_session_id');
    if (!sessionId) {
        alert('No session selected. Please select a session first.');
        return;
    }

    // Set context for data-layer.js functions
    if (window.esg && window.esg.setCurrentSession) {
        window.esg.setCurrentSession(sessionId);
    }

    const confirmRemove = await showConfirmModal(
        `Are you sure you want to remove "${participantName || clientId.substring(0, 8)}" from this session?<br><br>This will remove their participant record from the session metadata. They can still rejoin the session.`,
        'Remove Participant',
        { type: 'default', confirmText: 'Remove', cancelText: 'Cancel' }
    );
    if (!confirmRemove) return;

    try {
        // Get current session metadata
        const metadata = await window.esg.getSessionMetadata() || {};
        if (!metadata.participants) {
            metadata.participants = {};
        }

        // Remove the participant
        delete metadata.participants[clientId];

        // Save back to database
        const success = await window.esg.updateSessionMetadata({ participants: metadata.participants });

        if (success) {
            if (window.esg.showToast) {
                window.esg.showToast(`Participant "${participantName || clientId.substring(0, 8)}" removed from session`);
            }
            await refreshParticipants();
        } else {
            await showAlertModal('Failed to remove participant. Please try again.', 'Error');
        }
    } catch (error) {
        console.error('Remove participant error:', error);
        await showAlertModal('Failed to remove participant: ' + error.message, 'Error');
    }
}

async function saveParticipantNote() {
    if (!hasUtil) {
        alert('Database connection not available.');
        return;
    }

    const sessionId = selectedSessionId || sessionStorage.getItem('esg_selected_session_id');
    if (!sessionId) {
        alert('No session selected. Please select a session first.');
        return;
    }

    // Set context for data-layer.js functions
    if (window.esg && window.esg.setCurrentSession) {
        window.esg.setCurrentSession(sessionId);
    }

    const clientIdInput = document.getElementById('participantClientId');
    const nameInput = document.getElementById('participantName');
    const roleSelect = document.getElementById('participantRole');

    const clientId = clientIdInput ? clientIdInput.value.trim() : sessionStorage.getItem('esg_client_id');
    const name = nameInput ? nameInput.value.trim() : '';
    const role = roleSelect ? roleSelect.value : '';

    if (!clientId) {
        alert('Client ID is required');
        return;
    }

    try {
        // Get current session metadata
        const metadata = await window.esg.getSessionMetadata() || {};
        if (!metadata.participants) metadata.participants = {};

        // Get existing participant data to preserve joined_at and last_seen
        const existing = metadata.participants[clientId] || {};

        // Update participant note
        metadata.participants[clientId] = {
            ...existing,
            name: name || 'Unknown User',
            role: role || 'participant',
            updated_at: new Date().toISOString()
        };

        // Save back to database
        const success = await window.esg.updateSessionMetadata({ participants: metadata.participants });
        const error = success ? null : new Error('Failed to update session metadata');

        if (error) {
            throw error;
        }

        window.esg.showToast('Participant note saved');
        closeParticipantModal();
        await refreshParticipants();
    } catch (error) {
        console.error('Save participant note error:', error);
        await showAlertModal('Failed to save participant note: ' + error.message, 'Error');
    }
}

// Make functions globally available
window.refreshParticipants = refreshParticipants;
window.showAddParticipantModal = showAddParticipantModal;
window.closeParticipantModal = closeParticipantModal;
window.editParticipantNote = editParticipantNote;
window.saveParticipantNote = saveParticipantNote;
window.removeParticipant = removeParticipant;
window.deleteParticipantFromModal = deleteParticipantFromModal;
window.editParticipantNote = editParticipantNote;
window.saveParticipantNote = saveParticipantNote;

// 4. GLOBAL STATE CONTROL

async function updateGameState() {
    const moveSelector = document.getElementById('moveSelector');
    currentMove = parseInt(moveSelector.value);
    const epochLabel = document.getElementById('moveEpoch');
    if (epochLabel && moveEpochs[currentMove]) {
        epochLabel.textContent = moveEpochs[currentMove];
    }

    // Update database if available
    if (hasUtil) {
        await window.esg.updateGameState({ move: currentMove, phase: currentPhase });
    } else {
        saveGlobalState();
    }

    renderTimeline();
    renderActions();
    renderRequests();
}

async function setPhase(phaseNum) {
    currentPhase = phaseNum;

    // Update visual buttons
    document.querySelectorAll('.phase-btn').forEach(btn => {
        if (parseInt(btn.getAttribute('data-phase')) === currentPhase) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const activePhaseEl = document.getElementById('activePhase');
    if (activePhaseEl) activePhaseEl.textContent = `Phase ${currentPhase}`;

    // Update database if available
    if (hasUtil) {
        await window.esg.updateGameState({ move: currentMove, phase: currentPhase });
    } else {
        saveGlobalState();
    }
}

// CRITICAL-3: Game Control Functions
async function advanceMove() {
    if (currentMove >= 3) {
        await showAlertModal('Already at final move (Move 3)', 'Cannot Advance');
        return;
    }

    const confirmAdvance = await showConfirmModal(
        `Advance from Move ${currentMove} to Move ${currentMove + 1}?<br><br>This will start a new epoch for all teams.`,
        'Advance Move',
        { type: 'default', confirmText: 'Advance', cancelText: 'Cancel' }
    );

    if (!confirmAdvance) return;

    currentMove++;
    currentPhase = 1;

    if (hasUtil && selectedSessionId && window.researchTracking) {
        await window.researchTracking.enhancedUpdateGameState({
            move: currentMove,
            phase: currentPhase,
            reason: 'manual_advance'
        });
    } else if (hasUtil && selectedSessionId) {
        await window.esg.updateGameState({
            move: currentMove,
            phase: currentPhase
        });
    }

    saveGlobalState();
    updateUIFromState();
    window.esg.showToast(`Advanced to Move ${currentMove}`);
}

async function advancePhase() {
    if (currentPhase >= 5) {
        await showAlertModal('Already at final phase (Phase 5). Use Advance Move to proceed to next move.', 'Cannot Advance');
        return;
    }

    currentPhase++;

    if (hasUtil && selectedSessionId && window.researchTracking) {
        await window.researchTracking.enhancedUpdateGameState({
            phase: currentPhase,
            reason: 'manual_advance'
        });
    } else if (hasUtil && selectedSessionId) {
        await window.esg.updateGameState({
            phase: currentPhase
        });
    }

    setPhase(currentPhase);
    window.esg.showToast(`Advanced to Phase ${currentPhase}`);
}

async function resetPhase() {
    const confirmReset = await showConfirmModal(
        `Reset current phase (Move ${currentMove}, Phase ${currentPhase})?<br><br>This will clear phase-specific data.`,
        'Reset Phase',
        { type: 'default', confirmText: 'Reset', cancelText: 'Cancel' }
    );

    if (!confirmReset) return;
    resetTimer();
    window.esg.showToast(`Phase ${currentPhase} reset`);
}

// Expose functions
window.advanceMove = advanceMove;
window.advancePhase = advancePhase;
window.resetPhase = resetPhase;

function saveGlobalState() {
    const state = {
        move: currentMove,
        phase: currentPhase,
        timestamp: Date.now()
    };
    localStorage.setItem(SHARED_STATE_KEY, JSON.stringify(state));
}

async function loadGameStateFromDB(sessionIdParam = null) {
    if (!hasUtil) {
        loadGameState();
        return;
    }

    const sessionId = sessionIdParam || selectedSessionId || sessionStorage.getItem('esg_selected_session_id');
    if (!sessionId) {
        return; // No session selected, can't load game state
    }

    // Set context for data-layer.js functions
    if (window.esg && window.esg.setCurrentSession) {
        window.esg.setCurrentSession(sessionId);
    }

    try {
        const state = await window.esg.fetchGameState();
        if (state) {
            currentMove = state.move || 1;
            currentPhase = state.phase || 1;
            const selector = document.getElementById('moveSelector');
            if (selector) selector.value = currentMove;
            const epochLabel = document.getElementById('moveEpoch');
            if (epochLabel && moveEpochs[currentMove]) {
                epochLabel.textContent = moveEpochs[currentMove];
            }
            setPhase(currentPhase);
        } else {
            // Initialize if no state exists
            await window.esg.updateGameState({ move: 1, phase: 1 });
        }
    } catch (error) {
        console.error('Load game state error:', error);
        loadGameState(); // Fallback to localStorage
    }
}

function loadGameState() {
    try {
        const raw = localStorage.getItem(SHARED_STATE_KEY);
        const state = raw ? JSON.parse(raw) : null;
        if (state) {
            currentMove = state.move || 1;
            currentPhase = state.phase || 1;
            const selector = document.getElementById('moveSelector');
            if (selector) selector.value = currentMove;
            const epochLabel = document.getElementById('moveEpoch');
            if (epochLabel && moveEpochs[currentMove]) {
                epochLabel.textContent = moveEpochs[currentMove];
            }
            setPhase(currentPhase);
        }
    } catch (e) {
        console.error('Load game state error:', e);
    }
}

// 5. REAL-TIME SUBSCRIPTIONS

function setupSubscriptions() {
    if (!hasUtil) return;

    // Subscribe to game state changes
    window.esg.subscribeToGameState((newState) => {
        if (newState) {
            currentMove = newState.move || currentMove;
            currentPhase = newState.phase || currentPhase;
            updateUIFromState();
        }
    });

    // Subscribe to actions
    window.esg.subscribeToActions((payload) => {
        // Payload structure from Supabase: { eventType, new, old }
        const eventType = payload.eventType || (payload.new ? 'UPDATE' : 'INSERT');
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            updateMetrics();
            renderActions();
        }
    });

    // Subscribe to requests
    window.esg.subscribeToRequests((payload) => {
        // Payload structure from Supabase: { eventType, new, old }
        const eventType = payload.eventType || (payload.new ? 'UPDATE' : 'INSERT');
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            updateMetrics();
            renderRequests();
        }
    });

    // Subscribe to timeline
    window.esg.subscribeToTimeline((item) => {
        updateMetrics();
        const activeSection = document.querySelector('.section-content.active');
        if (activeSection && activeSection.id === 'timeline') {
            renderTimeline();
        }
    });
}

function updateUIFromState() {
    const selector = document.getElementById('moveSelector');
    if (selector) selector.value = currentMove;
    const epochLabel = document.getElementById('moveEpoch');
    if (epochLabel && moveEpochs[currentMove]) {
        epochLabel.textContent = moveEpochs[currentMove];
    }
    setPhase(currentPhase);
}

// 6. MONITORING & COLLATING

function startPolling() {
    // Poll every 3 seconds to update dashboard metrics
    setInterval(() => {
        updateMetrics();
    }, 3000);
}

async function updateMetrics() {
    if (hasUtil) {
        try {
            // Fetch actions for current move
            const actions = await window.esg.fetchActions(currentMove);
            const actionCount = actions ? actions.length : 0;
            const actionsEl = document.getElementById('totalActions');
            const actionsBadge = document.getElementById('actionsBadge');
            if (actionsEl) actionsEl.textContent = actionCount;
            if (actionsBadge) actionsBadge.textContent = actionCount;

            // Fetch requests
            const requests = await window.esg.fetchRequests();
            const pendingRequests = requests ? requests.filter(r => r.status === 'pending').length : 0;
            const requestsBadge = document.getElementById('requestsBadge');
            if (requestsBadge) requestsBadge.textContent = pendingRequests;

            // Timeline count (approximate from timeline items)
            const timelineBadge = document.getElementById('timelineBadge');
            if (timelineBadge) timelineBadge.textContent = actionCount + pendingRequests;

            // Update recent activity
            updateRecentActivity(actions, requests);
        } catch (error) {
            console.error('Update metrics error:', error);
        }
    } else {
        // Fallback to localStorage
        const actionCount = 0; // Would need to read from localStorage
        const actionsEl = document.getElementById('totalActions');
        if (actionsEl) actionsEl.textContent = actionCount;
    }
}

function updateRecentActivity(actions, requests) {
    const feedEl = document.getElementById('recentActivityFeed');
    if (!feedEl) return;

    const items = [];
    if (actions && actions.length > 0) {
        actions.slice(0, 5).forEach(action => {
            items.push({
                time: new Date(action.created_at).toLocaleTimeString(),
                type: 'ACTION',
                content: `${action.mechanism || 'Action'} submitted (${action.sector || 'N/A'})`
            });
        });
    }
    if (requests && requests.length > 0) {
        requests.slice(0, 3).forEach(req => {
            if (req.status === 'pending') {
                items.push({
                    time: new Date(req.created_at).toLocaleTimeString(),
                    type: 'RFI',
                    content: `RFI: ${req.query ? req.query.substring(0, 50) : 'Request'}...`
                });
            }
        });
    }

    if (items.length === 0) {
        feedEl.innerHTML = '<div class="empty-state">Waiting for team input...</div>';
    } else {
        feedEl.innerHTML = items.map(item => `
            <div style="padding: 8px; border-left: 3px solid #1a4480; margin-bottom: 5px; background: #f8fafc;">
                <div style="font-size: 0.8rem; color: #64748b;">
                    <span>${item.time}</span> • <span>${item.type}</span>
            </div>
                <div style="margin-top: 3px;">${item.content}</div>
        </div>
    `).join('');
    }
}

// 7. RENDERING DATA

async function renderTimeline() {
    const container = document.getElementById('masterTimelineFeed');
    if (!container) return;

    if (hasUtil) {
        try {
            const timelineItems = await window.esg.fetchTimeline(); // Fetch all

            if (!timelineItems || timelineItems.length === 0) {
                container.innerHTML = '<div class="empty-state">No timeline events recorded yet.</div>';
                return;
            }

            // Sort by timestamp descending (newest first)
            timelineItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            container.innerHTML = timelineItems.map(item => {
                const teamColors = {
                    'blue': 'var(--color-team-blue, #2563eb)',
                    'green': 'var(--color-team-green, #16a34a)',
                    'red': 'var(--color-team-red, #dc2626)',
                    'white': 'var(--color-team-white, #475569)'
                };
                const teamColor = teamColors[item.team?.toLowerCase()] || '#94a3b8';

                return `
                    <div class="timeline-item" style="border-left: 3px solid ${teamColor}; margin-bottom: 10px; padding: 10px; background: #fff; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span style="font-weight: 600; font-size: 0.85rem; color: ${teamColor}; text-transform: uppercase;">
                                ${item.team || 'Unknown Team'}
                            </span>
                            <span style="font-size: 0.8rem; color: #64748b;">
                                ${new Date(item.created_at).toLocaleTimeString()}
                            </span>
                        </div>
                        <div style="font-size: 0.9rem; color: #1e293b;">
                            ${item.content || item.title || 'No content'}
                        </div>
                        ${item.type ? `<div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px; text-transform: capitalize;">${item.type.replace(/_/g, ' ')}</div>` : ''}
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Render timeline error:', error);
            container.innerHTML = '<div class="empty-state">Error loading timeline.</div>';
        }
    } else {
        container.innerHTML = '<div class="empty-state">Database connection required for timeline.</div>';
    }
}

async function renderActions() {
    const container = document.getElementById('actionsFeed');
    if (!container) return;

    if (hasUtil) {
        try {
            const actions = await window.esg.fetchActions(currentMove);

            if (!actions || actions.length === 0) {
                container.innerHTML = '<div class="empty-state">No strategic actions submitted yet.</div>';
                return;
            }

            container.innerHTML = actions.map(action => {
                const isAdjudicated = action.status === 'adjudicated';
                const adjudication = action.adjudication || {};
                return `
                    <div class="action-card" style="border: 1px solid ${isAdjudicated ? '#28a745' : '#ccc'}; padding: 15px; margin-bottom: 10px; border-radius: 6px; background: ${isAdjudicated ? '#f0fff4' : '#fff'};">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <h4 style="margin:0;">${action.mechanism || 'Action'} (${action.sector || 'N/A'})</h4>
                                <p style="font-size: 0.9rem; margin: 5px 0;"><strong>Goal:</strong> ${action.goal || 'N/A'}</p>
                                <div style="font-size: 0.8rem; color: #666; margin-top: 5px;">
                                    <strong>Targets:</strong> ${Array.isArray(action.targets) ? action.targets.join(', ') : (action.targets || 'N/A')}
                                </div>
                                ${isAdjudicated ? `
                                    <div style="margin-top: 10px; padding: 10px; background: #e8f5e9; border-radius: 4px;">
                                        <strong>Outcome:</strong> ${adjudication.outcome || 'N/A'}<br>
                                        <strong>Narrative:</strong> ${adjudication.narrative || 'N/A'}
                                    </div>
                                ` : ''}
                            </div>
                            ${!isAdjudicated ? `
                                <button class="btn btn-primary" onclick="openAdjudicationModal('${action.id}')" 
                                        style="margin-left: 10px; padding: 8px 16px; background: #1a4480; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    Adjudicate
                                </button>
                            ` : `
                                <span style="margin-left: 10px; padding: 4px 8px; background: #28a745; color: white; border-radius: 4px; font-size: 0.8rem;">
                                    Adjudicated
                                </span>
                            `}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Render actions error:', error);
            container.innerHTML = '<div class="empty-state">Error loading actions.</div>';
        }
    } else {
        container.innerHTML = '<div class="empty-state">Database connection required for actions.</div>';
    }
}

async function renderRequests() {
    const container = document.getElementById('requestsFeed');
    if (!container) return;

    if (hasUtil) {
        try {
            const requests = await window.esg.fetchRequests();
            const pendingRequests = requests ? requests.filter(r => r.status === 'pending') : [];

            if (pendingRequests.length === 0) {
                container.innerHTML = '<div class="empty-state">No pending RFIs.</div>';
                return;
            }

            container.innerHTML = pendingRequests.map(req => `
                <div class="request-card" style="border: 1px solid #ccc; padding: 15px; margin-bottom: 10px; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                                <span style="padding: 4px 8px; background: #ffc107; color: #000; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                                    ${req.priority || 'NORMAL'}
                                </span>
                                <span style="font-size: 0.8rem; color: #666;">
                                    ${new Date(req.created_at).toLocaleString()}
                                </span>
                            </div>
                            <h4 style="margin: 0 0 8px 0;">${req.query || 'RFI Request'}</h4>
                            ${req.categories ? `
                                <div style="font-size: 0.8rem; color: #666; margin-bottom: 8px;">
                                    Categories: ${Array.isArray(req.categories) ? req.categories.join(', ') : req.categories}
                                </div>
                            ` : ''}
                        </div>
                        <button class="btn btn-primary" onclick="openResponseModal('${req.id}', \`${(req.query || '').replace(/`/g, '\\`')}\`)" 
                                style="margin-left: 10px; padding: 8px 16px; background: #1a4480; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Respond
                        </button>
                    </div>
        </div>
    `).join('');
        } catch (error) {
            console.error('Render requests error:', error);
            container.innerHTML = '<div class="empty-state">Error loading requests.</div>';
        }
    } else {
        container.innerHTML = '<div class="empty-state">Database connection required for requests.</div>';
    }
}

function refreshActions() {
    renderActions();
    updateMetrics();
}

function refreshRequests() {
    renderRequests();
    updateMetrics();
}

// 8. ADJUDICATION FUNCTIONS

function openAdjudicationModal(actionId) {
    currentActionId = actionId;
    const modal = document.getElementById('adjudicationModal');
    if (modal) {
        modal.style.display = 'block';
        // Reset form
        const outcomeSelect = document.getElementById('adj-outcome');
        const narrativeText = document.getElementById('adj-narrative');
        const vulnerabilitiesInput = document.getElementById('adj-vulnerabilities');
        if (outcomeSelect) outcomeSelect.value = '';
        if (narrativeText) narrativeText.value = '';
        if (vulnerabilitiesInput) vulnerabilitiesInput.value = '';
    }
}

function closeAdjudicationModal() {
    const modal = document.getElementById('adjudicationModal');
    if (modal) modal.style.display = 'none';
    currentActionId = null;
}

async function submitAdjudication() {
    if (!hasUtil) {
        await showAlertModal('Database connection not available.', 'Connection Error');
        return;
    }

    if (!currentActionId) {
        await showAlertModal('No action selected', 'No Action Selected');
        return;
    }

    const outcome = document.getElementById('adj-outcome')?.value;
    const narrative = document.getElementById('adj-narrative')?.value;
    const vulnerabilities = document.getElementById('adj-vulnerabilities')?.value;

    if (!outcome) {
        await showAlertModal('Please select an outcome verdict', 'Outcome Required');
        return;
    }

    if (!narrative) {
        await showAlertModal('Please enter a narrative', 'Narrative Required');
        return;
    }

    const adjData = {
        outcome: outcome,
        narrative: narrative,
        vulnerabilities: vulnerabilities ? vulnerabilities.split(',').map(v => v.trim()) : [],
        timestamp: new Date().toISOString()
    };

    try {
        await window.esg.submitAdjudication(currentActionId, adjData);
        window.esg.showToast('Adjudication submitted successfully');
        closeAdjudicationModal();
        renderActions();
        updateMetrics();
    } catch (error) {
        console.error('Submit adjudication error:', error);
        await showAlertModal('Failed to submit adjudication: ' + error.message, 'Error');
    }
}

// 9. RFI RESPONSE FUNCTIONS

function openResponseModal(requestId, requestText) {
    currentRequestId = requestId;
    const modal = document.getElementById('responseModal');
    const requestTextEl = document.getElementById('responseRequestText');
    const responseTextEl = document.getElementById('responseText');

    if (modal) {
        modal.style.display = 'block';
        if (requestTextEl) requestTextEl.textContent = requestText || 'RFI Request';
        if (responseTextEl) responseTextEl.value = '';
    }
}

function closeResponseModal() {
    const modal = document.getElementById('responseModal');
    if (modal) modal.style.display = 'none';
    currentRequestId = null;
}

async function submitResponse() {
    if (!hasUtil) {
        await showAlertModal('Database connection not available.', 'Connection Error');
        return;
    }

    if (!currentRequestId) {
        await showAlertModal('No request selected', 'No Request Selected');
        return;
    }

    const responseText = document.getElementById('responseText')?.value;
    if (!responseText || !responseText.trim()) {
        await showAlertModal('Please enter a response', 'Response Required');
        return;
    }

    try {
        // Fetch the request object first
        const requests = await window.esg.fetchRequests();
        const request = requests ? requests.find(r => r.id === currentRequestId) : null;

        if (!request) {
            await showAlertModal('Request not found', 'Request Not Found');
            return;
        }

        await window.esg.sendResponse(request, responseText.trim());
        window.esg.showToast('Response sent successfully');
        closeResponseModal();
        renderRequests();
        updateMetrics();
    } catch (error) {
        console.error('Submit response error:', error);
        await showAlertModal('Failed to send response: ' + error.message, 'Error');
    }
}

// 10. TIMER LOGIC
function startTimer(shouldRun) {
    if (shouldRun && !timerInterval) {
        timerInterval = setInterval(() => {
            if (timerSeconds > 0) {
                timerSeconds--;
                updateTimerDisplay();
                persistTimerState(true);
            } else {
                clearInterval(timerInterval);
                timerInterval = null;
                persistTimerState(false);
            }
        }, 1000);
        persistTimerState(true);
    } else if (!shouldRun && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        persistTimerState(false);
    } else if (!shouldRun) {
        persistTimerState(false);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = 90 * 60;
    updateTimerDisplay();
    persistTimerState(false);
}

function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    document.getElementById('timer').textContent =
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 6. ADMIN / DATA MANAGEMENT

/**
 * Collates all data and triggers a download
 * Replaces functionality of autoSave.js for manual archive
 */
function gatherSimulationData() {
    const ts = (window.toIsoNow ? toIsoNow() : new Date().toISOString());
    const archive = {
        simulation_archive: {
            meta: {
                simulation_date: ts.split('T')[0],
                total_moves_played: 3,
                exported_at: ts,
                shared_state: readStore(SHARED_STATE_KEY, null),
                shared_timer: readStore(SHARED_TIMER_KEY, null)
            }
        }
    };

    const tables = {
        actions: [],
        timeline: [],
        notes: []
    };

    for (let move = 1; move <= 3; move++) {
        const moveKey = `move_${move}`;
        const facilitatorKey = FAC_KEY(move);
        const facilitatorSubmissionKey = FAC_SUBMISSION_KEY(move);
        const requestsKey = REQUEST_KEY(move);
        const whiteKey = WHITE_KEY(move);

        const facilitator_data = {
            role: 'BLUE_FACILITATOR',
            move_id: move,
            epoch: `Epoch ${move}`,
            timestamp_export: ts,
            strategic_actions: [],
            information_requests: []
        };

        try {
            const actionsObj = readStore(facilitatorKey, { actions: [] });
            if (actionsObj && Array.isArray(actionsObj.actions)) {
                facilitator_data.strategic_actions = actionsObj.actions;
            }
        } catch { }
        try {
            const submission = readStore(facilitatorSubmissionKey, null);
            if (submission && Array.isArray(submission.actions) && facilitator_data.strategic_actions.length === 0) {
                facilitator_data.strategic_actions = submission.actions;
            }
        } catch { }

        try {
            const reqArr = readStore(requestsKey, []);
            if (Array.isArray(reqArr)) {
                facilitator_data.information_requests = reqArr;
            } else if (reqArr && Array.isArray(reqArr.requests)) {
                facilitator_data.information_requests = reqArr.requests;
            }
        } catch { }

        const white_cell_data = {
            role: 'WHITE_CELL',
            move_id: move,
            adjudications: [],
            communications_log: [],
            timeline_items: []
        };
        try {
            const whiteObj = readStore(whiteKey, { adjudications: [], communications_log: [], timelineItems: [] });
            if (whiteObj.adjudications) white_cell_data.adjudications = whiteObj.adjudications;
            if (whiteObj.communications_log) white_cell_data.communications_log = whiteObj.communications_log;
            if (Array.isArray(whiteObj.timelineItems)) white_cell_data.timeline_items = whiteObj.timelineItems;
        } catch { }

        const notetakerKey = NOTE_KEY(move);
        const notetaker_data = {
            role: 'BLUE_NOTETAKER',
            move_id: move,
            dynamics_analysis: {},
            external_factors: {},
            observation_timeline: []
        };
        try {
            const noteObj = readStore(notetakerKey, { observation_timeline: [] });
            if (Array.isArray(noteObj.observation_timeline)) {
                notetaker_data.observation_timeline = noteObj.observation_timeline;
            }
            if (noteObj.dynamics_analysis) notetaker_data.dynamics_analysis = noteObj.dynamics_analysis;
            if (noteObj.external_factors) notetaker_data.external_factors = noteObj.external_factors;
        } catch { }

        // Build flat tables for exports
        (facilitator_data.strategic_actions || []).forEach(action => {
            tables.actions.push({
                move,
                mechanism: action.mechanism || '',
                sector: action.sector || '',
                goal: action.goal || '',
                targets: Array.isArray(action.targets) ? action.targets.join('; ') : (action.targets || ''),
                resources: action.resources || action.resource_needs || '',
                timeline: action.timeline || '',
                notes: action.notes || action.rationale || ''
            });
        });

        (white_cell_data.timeline_items || []).forEach(item => {
            tables.timeline.push({
                move,
                time: item.time || item.timestamp || '',
                type: (item.type || '').toUpperCase(),
                content: item.content || item.text || '',
                actor: item.actor || item.author || ''
            });
        });

        (notetaker_data.observation_timeline || []).forEach(item => {
            tables.notes.push({
                move,
                time: item.time || item.timestamp || '',
                type: (item.type || '').toUpperCase(),
                content: item.content || item.text || item.note || '',
                sentiment: item.sentiment || ''
            });
        });

        archive.simulation_archive[moveKey] = {
            facilitator_data,
            notetaker_data,
            white_cell_data
        };
    }

    return { ts, archive, tables };
}


// 7. EXPORT FUNCTIONS (Delegated to Data Layer)

function exportFullArchive() {
    if (window.esg && window.esg.exportJSON) {
        window.esg.exportJSON(selectedSessionId);
    } else {
        alert('Data Layer exportJSON not available');
    }
}

async function exportTabularData() {
    if (window.esg && window.esg.exportXLSX) {
        await window.esg.exportXLSX(selectedSessionId);
    } else {
        alert('Data Layer exportXLSX not available');
    }
}

async function exportPdfSummary() {
    if (window.esg && window.esg.exportPDF) {
        await window.esg.exportPDF(selectedSessionId);
    } else {
        alert('Data Layer exportPDF not available');
    }
}

async function exportZipBundle() {
    if (window.esg && window.esg.exportZIP) {
        await window.esg.exportZIP(selectedSessionId);
    } else {
        alert('Data Layer exportZIP not available');
    }
}


/**
 * The Hard Reset - Wipes the board for a new game
 * Replaces resetAllLocalStorage
 */
// Flag to prevent saving during reset
let isResetting = false;

async function hardResetSimulation() {
    const confirmed = await showConfirmModal(
        "CRITICAL WARNING: This will wipe all game data, timelines, and actions. Are you sure you want to initialize a new game?<br><br>This action cannot be undone.",
        'Initialize New Game',
        { type: 'danger', confirmText: 'Yes, Initialize', cancelText: 'Cancel' }
    );

    if (!confirmed) return;

    try {
        isResetting = true; // Prevent any further saves
        // 0. If connected to DB, delete the session
        if (typeof hasUtil !== 'undefined' && hasUtil && window.esg) {
            const sessionId = selectedSessionId || sessionStorage.getItem('esg_selected_session_id') || window.esg.CURRENT_SESSION_ID;
            if (sessionId) {
                // Hard delete the session to wipe data
                await window.esg.deleteSession(sessionId, true);
            }
        }

        // 1. Clear Local Storage
        localStorage.clear();
        sessionStorage.clear();

        // 2. Clear selected session
        selectedSessionId = null;
        if (window.esg) {
            window.esg.CURRENT_SESSION_ID = null;
        }

        // 3. Set default state
        const defaultState = { move: 1, phase: 1, timestamp: Date.now() };
        localStorage.setItem(SHARED_STATE_KEY, JSON.stringify(defaultState));
        const defaultTimer = { seconds: 90 * 60, running: false, lastUpdate: Date.now() };
        localStorage.setItem(SHARED_TIMER_KEY, JSON.stringify(defaultTimer));

        // 4. Show success message
        if (window.esg && window.esg.showToast) {
            window.esg.showToast('Game data cleared. Reloading...');
        }

        // 5. Reload to flush memory
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (error) {
        console.error('Hard reset error:', error);
        await showAlertModal('Failed to initialize new game: ' + error.message, 'Error');
    }
}

// Expose hardResetSimulation globally for onclick handler
window.hardResetSimulation = hardResetSimulation;

function persistTimerState(running) {
    if (isResetting) return;
    const state = {
        seconds: timerSeconds,
        running: !!running,
        lastUpdate: Date.now()
    };
    try {
        localStorage.setItem(SHARED_TIMER_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Failed to persist timer state', e);
    }
}

function loadTimerState() {
    const state = readStore(SHARED_TIMER_KEY, null);
    if (state && typeof state === 'object') {
        timerSeconds = typeof state.seconds === 'number' ? state.seconds : 90 * 60;
        if (state.running && state.lastUpdate) {
            const elapsed = Math.floor((Date.now() - state.lastUpdate) / 1000);
            timerSeconds = Math.max(0, timerSeconds - elapsed);
        }
        updateTimerDisplay();
        if (state.running) {
            startTimer(true);
        }
    } else {
        persistTimerState(false);
    }
}