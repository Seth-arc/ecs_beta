// Database integration with data-layer.js
const hasUtil = typeof window.esg !== 'undefined';

let currentSessionId = (typeof window !== 'undefined' && window.sessionStorage) ? window.sessionStorage.getItem('esg_session_id') : null;

// Basic functionality for the facilitator platform
let currentMove = 1;
const moveEpochs = {
    1: 'Epoch 1 (2027-2030)',
    2: 'Epoch 2 (2030-2032)',
    3: 'Epoch 3 (2032-2034)'
};

let currentPhase = 1;
let actions = [];
let infoRequests = [];
let observations = [];
let whiteResponses = [];

// Read-only move and phase - controlled by White Cell (session removed)
function getSharedGameStateKey() {
    return (window.STORAGE_KEYS && STORAGE_KEYS.sharedState) || 'sharedGameState';
}

// ==========================================
// MEDIUM-1: STANDARDIZED ERROR HANDLING
// ==========================================

/**
 * Handle user-facing validation errors with toast notifications
 * @param {string} message - User-friendly error message
 */
function handleUserError(message) {
    if (window.esg?.showToast) {
        window.esg.showToast(message, 3000);
    } else if (typeof showToast === 'function') {
        showToast(message, 3000);
    } else {
        console.warn('Toast not available:', message);
        alert(message); // Fallback
    }
}

/**
 * Handle system errors with modal dialogs
 * @param {Error} error - Error object
 * @param {string} context - Context description
 */
async function handleSystemError(error, context = '') {
    const message = context ? `${context}: ${error.message}` : error.message;
    console.error(context || 'System Error:', error);

    if (window.showAlertModal) {
        await window.showAlertModal(message, 'Error');
    } else {
        alert(message);
    }
}

/**
 * Show confirmation dialog with consistent interface
 * @param {string} message - Confirmation message
 * @param {string} title - Dialog title
 * @param {object} options - Additional options
 * @returns {Promise<boolean>} User's choice
 */
async function confirmAction(message, title = 'Confirm', options = {}) {
    if (window.showConfirmModal) {
        return await window.showConfirmModal(message, title, options);
    } else {
        return confirm(message);
    }
}

// ==========================================
// MEDIUM-2: VISUAL FORM VALIDATION FEEDBACK
// ==========================================

/**
 * Validate a form field with visual feedback
 * @param {string} fieldId - ID of the field to validate
 * @param {boolean} isValid - Whether the field is valid
 * @param {string} errorMessage - Error message to display if invalid
 */
function validateField(fieldId, isValid, errorMessage = '') {
    const field = document.getElementById(fieldId);
    if (!field) return;

    if (isValid) {
        // Field is valid - show success state
        field.classList.remove('field-error');
        field.classList.add('field-valid');
        field.setAttribute('aria-invalid', 'false');

        // Remove error message if exists
        const errorEl = document.getElementById(`${fieldId}-error`);
        if (errorEl) errorEl.remove();
    } else {
        // Field is invalid - show error state
        field.classList.remove('field-valid');
        field.classList.add('field-error');
        field.setAttribute('aria-invalid', 'true');

        // Add or update error message
        let errorEl = document.getElementById(`${fieldId}-error`);
        if (!errorEl) {
            errorEl = document.createElement('span');
            errorEl.id = `${fieldId}-error`;
            errorEl.className = 'field-error-message';
            errorEl.setAttribute('role', 'alert');
            field.parentNode.appendChild(errorEl);
        }
        errorEl.textContent = errorMessage;
        field.setAttribute('aria-describedby', `${fieldId}-error`);
    }
}

function getFacilitatorKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'facilitator')) || `actions_move_${move}`;
}

function getFacilitatorSubmissionKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'facilitatorSubmission')) || `blueActions_move_${move}`;
}

function getRequestsKey(move = currentMove) {
    return (window.buildMoveKey && buildMoveKey(move, 'requests')) || `blueRequests_move_${move}`;
}

function updateGameStateFromShared() {
    const gameState = safeGetItem(getSharedGameStateKey(), null);
    if (gameState) {
        // Update move
        if (gameState.move && gameState.move !== currentMove) {
            currentMove = gameState.move;
            // moveSelector is no longer present in facilitator view

            const moveEpochEl = document.getElementById('moveEpoch');
            if (moveEpochEl) moveEpochEl.textContent = moveEpochs[currentMove];

            const whiteResponsesMoveEl = document.getElementById('whiteResponsesMove');
            if (whiteResponsesMoveEl) whiteResponsesMoveEl.textContent = currentMove;

            loadData();
            loadWhiteResponses();
        }

        // Update phase
        if (gameState.phase && gameState.phase !== currentPhase) {
            currentPhase = gameState.phase;
            document.querySelectorAll('.phase-btn').forEach(btn => {
                if (parseInt(btn.getAttribute('data-phase')) === currentPhase) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            updatePhaseGuidance();
        }

    }
}

function updatePhaseGuidance() {
    const container = document.getElementById('phaseGuidanceContainer');
    const guidance = {
        1: "Phase 1: Internal Deliberation — Facilitate BLUE Team discussions and decision-making",
        2: "Phase 2: Alliance Consultation — Coordinate with external parties and WHITE Cell",
        3: "Phase 3: Finalization — Help finalize decisions and prepare for adjudication",
        4: "Phase 4: Adjudication — Process WHITE Cell feedback and results",
        5: "Phase 5: Results Brief — Present outcomes and lessons learned"
    };
    container.innerHTML = `
                <div class="phase-guidance">
                    <strong>Current Phase ${currentPhase}</strong>
                    ${guidance[currentPhase]}
                </div>
            `;
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

// Navigation with History Support & Deep Linking
const handleNavigation = (sectionId, addHistory = true) => {
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) return;

    // Update UI
    document.querySelectorAll('.nav-item').forEach(i => {
        if (i.getAttribute('data-section') === sectionId) {
            i.classList.add('active');
        } else {
            i.classList.remove('active');
        }
    });

    document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
    targetSection.classList.add('active');

    // Handle History
    if (addHistory) {
        const url = new URL(window.location);
        url.hash = sectionId;
        window.history.pushState({ section: sectionId }, '', url);
    }

    // HIGH-2: Log page view
    // Use non-blocking call
    if (hasUtil && currentSessionId && window.researchTracking && window.researchTracking.logParticipantActivity) {
        window.researchTracking.logParticipantActivity(
            currentSessionId,
            window.esg.getClientId(),
            'page_view',
            { section: sectionId }
        ).catch(console.error);
    }

    // Update timeline when timeline section is opened
    if (sectionId === 'timeline') {
        updateTimeline();
    }
};

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const sectionId = item.getAttribute('data-section');
        handleNavigation(sectionId, true);
    });
});

// Handle Back/Forward buttons
window.addEventListener('popstate', (event) => {
    const sectionId = event.state?.section || (window.location.hash.substring(1) || 'info-requests');
    // Ensure section exists (security/robustness)
    const exists = document.getElementById(sectionId);
    if (exists) {
        handleNavigation(sectionId, false);
    }
});

// Handle initial deep link
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.hash) {
            const sectionId = window.location.hash.substring(1);
            if (document.getElementById(sectionId)) {
                handleNavigation(sectionId, false);
            }
        }
    });
} else {
    // If already loaded
    if (window.location.hash) {
        const sectionId = window.location.hash.substring(1);
        if (document.getElementById(sectionId)) {
            handleNavigation(sectionId, false);
        }
    }
}

// Category checkboxes for info requests
document.querySelectorAll('.category-checkbox').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.toggle('selected');
    });
});

// Target checkboxes for actions
document.querySelectorAll('.target-checkbox').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.toggle('selected');
    });
});

// Mechanism dropdown - show/hide "Other" input field
const mechanismSelect = document.getElementById('actionMechanism');
const otherContainer = document.getElementById('otherMechanismContainer');
if (mechanismSelect && otherContainer) {
    mechanismSelect.addEventListener('change', (e) => {
        if (e.target.value === 'other') {
            otherContainer.style.display = 'block';
        } else {
            otherContainer.style.display = 'none';
            // Clear the input when hiding
            const otherInput = document.getElementById('otherMechanismInput');
            if (otherInput) otherInput.value = '';
        }
    });
}

// Info Requests management
async function addInfoRequest() {
    const priority = document.getElementById('requestPriority').value;
    const details = document.getElementById('requestDetails').value.trim();

    // HIGH-3: Enhanced field-by-field validation with specific messages
    if (!priority) {
        showToast('Please select a priority level');
        return;
    }

    const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox.selected'))
        .map(btn => btn.getAttribute('data-category'));

    if (selectedCategories.length === 0) {
        showToast('Please select at least one category');
        return;
    }

    if (!details) {
        showToast('Please describe what information is needed');
        return;
    }

    if (details.length < 20) {
        showToast('Request details must be at least 20 characters');
        return;
    }

    // Check session
    if (hasUtil && !currentSessionId) {
        handleUserError('Please join a session first before submitting requests.');
        showSessionJoinPrompt();
        return;
    }

    const priorityCanon = (window.normalizePriority ? normalizePriority(priority) : String(priority).toUpperCase());
    const categoriesLabeled = (window.mapCategoriesToLabels ? mapCategoriesToLabels(selectedCategories) : selectedCategories);

    // Submit to database/data -layer
    if (hasUtil && currentSessionId) {
        try {
            const formData = {
                priority: priorityCanon,
                categories: categoriesLabeled,
                details: details
            };

            await window.esg.submitRequest(formData);

            // HIGH-2: Log participant activity
            if (window.researchTracking && window.researchTracking.logParticipantActivity) {
                await window.researchTracking.logParticipantActivity(
                    currentSessionId,
                    window.esg.getClientId(),
                    'rfi_created',
                    { priority: priorityCanon, categories: categoriesLabeled }
                );
            }

            if (window.esg.showToast) {
                window.esg.showToast('Request submitted successfully');
            }

            // Reload from database to get the new request
            await loadData();
        } catch (error) {
            console.error('Submit request error:', error);
            await handleSystemError(error, 'Failed to submit request');
            return;
        }
    } else {
        handleUserError('System Error: Data Layer not active.');
    }

    // Reset form
    document.getElementById('requestPriority').value = '';
    document.getElementById('requestDetails').value = '';
    document.querySelectorAll('.category-checkbox').forEach(btn => btn.classList.remove('selected'));
}

// Ensure global availability for inline onclick usage
window.addInfoRequest = addInfoRequest;
window.addAction = addAction;

function updateRequestsDisplay() {
    const container = document.getElementById('pendingRequests');
    if (infoRequests.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        <p>No information requests yet</p>
                        <p>Requests will appear here when submitted</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = infoRequests.map(request => `
                <div class="action-item" data-request-id="${request.id}">
                    <div class="action-header">
                        <span class="action-number">Request ${infoRequests.indexOf(request) + 1}</span>
                        <span class="priority-${(request.priority || '').toLowerCase()}">${(request.priority || '').toUpperCase()}</span>
                        <span>${(window.formatForUi ? formatForUi(request.timestamp) : request.timestamp) || ''}</span>
                        <div style="display: flex; gap: 8px; margin-left: auto;">
                            <button onclick="deleteRequest('${request.id}')" style="padding: 4px 8px; font-size: 0.75rem; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
                        </div>
                    </div>
                    <div><strong>Categories:</strong> ${Array.isArray(request.categories) ? request.categories.join(', ') : ''}</div>
                    <div><strong>Details:</strong> ${request.query_text}</div>
                </div>
            `).join('');
}

// Actions management
async function addAction() {
    let mechanism = document.getElementById('actionMechanism').value;
    const sector = document.getElementById('actionSector').value;
    const goal = document.getElementById('actionGoal').value.trim();
    const outcomes = document.getElementById('actionOutcomes').value.trim();
    const contingencies = document.getElementById('actionContingencies').value.trim();
    const exposure = document.getElementById('actionExposure').value;

    // If "Other" is selected, use the custom input value
    if (mechanism === 'other') {
        const otherMechanismInput = document.getElementById('otherMechanismInput');
        const customMechanism = otherMechanismInput ? otherMechanismInput.value.trim() : '';
        if (!customMechanism) {
            validateField('otherMechanismInput', false, 'Please specify the mechanism');
            showToast('Please specify the mechanism');
            return;
        }
        mechanism = customMechanism;
        validateField('otherMechanismInput', true);
    }

    // HIGH-3 + MEDIUM-2: Enhanced field-by-field validation with visual feedback
    if (!mechanism) {
        validateField('actionMechanism', false, 'Please select a mechanism');
        showToast('Please select a mechanism');
        return;
    }
    validateField('actionMechanism', true);

    if (!sector) {
        validateField('actionSector', false, 'Please select a sector');
        showToast('Please select a sector');
        return;
    }
    validateField('actionSector', true);

    if (!exposure) {
        validateField('actionExposure', false, 'Please select a type of exposure');
        showToast('Please select a type of exposure');
        return;
    }
    validateField('actionExposure', true);

    const selectedTargets = Array.from(document.querySelectorAll('.target-checkbox.selected'))
        .map(btn => btn.getAttribute('data-target'));

    if (selectedTargets.length === 0) {
        showToast('Please select at least one target');
        return;
    }

    if (!goal) {
        validateField('actionGoal', false, 'Please enter a goal for this action');
        showToast('Please enter a goal for this action');
        return;
    }
    validateField('actionGoal', true);

    if (goal.length < 10) {
        validateField('actionGoal', false, 'Goal must be at least 10 characters');
        showToast('Goal must be at least 10 characters');
        return;
    }
    validateField('actionGoal', true);

    if (!outcomes) {
        validateField('actionOutcomes', false, 'Please describe the expected outcomes');
        showToast('Please describe the expected outcomes');
        return;
    }
    validateField('actionOutcomes', true);

    if (outcomes.length < 10) {
        validateField('actionOutcomes', false, 'Expected outcomes must be at least 10 characters');
        showToast('Expected outcomes must be at least 10 characters');
        return;
    }
    validateField('actionOutcomes', true);

    if (!contingencies) {
        validateField('actionContingencies', false, 'Please describe ally contingencies');
        showToast('Please describe ally contingencies');
        return;
    }
    validateField('actionContingencies', true);

    if (contingencies.length < 10) {
        validateField('actionContingencies', false, 'Ally contingencies must be at least 10 characters');
        showToast('Ally contingencies must be at least 10 characters');
        return;
    }
    validateField('actionContingencies', true);

    // Check session
    if (hasUtil && !currentSessionId) {
        handleUserError('Please join a session first before submitting actions.');
        showSessionJoinPrompt();
        return;
    }

    // Submit to database/data-layer
    if (hasUtil && currentSessionId) {
        try {
            const formData = {
                mechanism: mechanism,
                sector: sector,
                exposure: exposure,
                targets: selectedTargets,
                goal: goal,
                outcomes: outcomes,
                contingencies: contingencies,
                status: 'draft'  // ✅ Set as draft initially
            };

            const success = await window.esg.submitAction(formData);

            if (success) {
                // HIGH-2: Log participant activity
                if (window.researchTracking && window.researchTracking.logParticipantActivity) {
                    await window.researchTracking.logParticipantActivity(
                        currentSessionId,
                        window.esg.getClientId(),
                        'action_created',
                        { mechanism: mechanism, sector: sector, status: 'draft' }
                    );
                }

                if (window.esg.showToast) {
                    window.esg.showToast('Action saved as draft');
                }

                // Reload from database to get the new action
                await loadData();
            } else {
                handleUserError('Failed to submit action. Please try again.');
                return;
            }
        } catch (error) {
            console.error('Submit action error:', error);
            alert('Failed to submit action: ' + error.message);
            return;
        }
    } else {
        handleUserError('System Error: Data Layer not active.');
    }

    // Reset form
    document.getElementById('actionMechanism').value = '';
    document.getElementById('actionSector').value = '';
    document.getElementById('actionExposure').value = '';
    document.getElementById('actionGoal').value = '';
    document.getElementById('actionOutcomes').value = '';
    document.getElementById('actionContingencies').value = '';
    document.querySelectorAll('.target-checkbox').forEach(btn => btn.classList.remove('selected'));

    // Reset custom mechanism input
    const otherMechanismInput = document.getElementById('otherMechanismInput');
    const otherContainer = document.getElementById('otherMechanismContainer');
    if (otherMechanismInput) otherMechanismInput.value = '';
    if (otherContainer) otherContainer.style.display = 'none';
}

// CRITICAL-4: Submit Action Function
async function submitAction(actionId) {
    const action = actions.find(a => a.id === actionId);
    if (!action) {
        showToast('Action not found');
        return;
    }

    if (action.status === 'submitted') {
        showToast('Action already submitted');
        return;
    }

    const confirmSubmit = confirm('Submit this action to WHITE Cell for adjudication?\n\nOnce submitted, the action cannot be edited or deleted.');
    if (!confirmSubmit) return;

    if (hasUtil && currentSessionId) {
        try {
            const success = await window.esg.updateAction(actionId, { status: 'submitted' });
            if (success) {
                // HIGH-2: Log participant activity
                if (window.researchTracking && window.researchTracking.logParticipantActivity) {
                    await window.researchTracking.logParticipantActivity(
                        currentSessionId,
                        window.esg.getClientId(),
                        'action_submitted',
                        { action_id: actionId }
                    );
                }

                window.esg.showToast('Action submitted for adjudication');
                await loadData();
            } else {
                handleUserError('Failed to submit action');
            }
        } catch (error) {
            console.error('Submit action error:', error);
            alert('Failed to submit action: ' + error.message);
        }
    } else {
        handleUserError('System Error: Data Layer not active.');
    }
}

window.submitAction = submitAction;

// Undo stack for actions
let undoStack = [];
const MAX_UNDO = 50;

function pushToUndoStack(type, data) {
    const wasAtLimit = undoStack.length >= MAX_UNDO;
    undoStack.push({ type, data, timestamp: Date.now() });
    if (undoStack.length > MAX_UNDO) {
        undoStack.shift();
        // Notify user when limit is reached
        if (!wasAtLimit) {
            showToast(`Undo limit reached (${MAX_UNDO} actions). Oldest actions will be removed.`, 4000);
        }
    }
}

function undoLastAction() {
    if (undoStack.length === 0) {
        showToast('Nothing to undo');
        return;
    }
    const lastAction = undoStack.pop();
    // Restore previous state
    if (lastAction.type === 'delete') {
        if (lastAction.data.type === 'action') {
            actions.push(lastAction.data.item);
        } else if (lastAction.data.type === 'request') {
            infoRequests.push(lastAction.data.item);
        } else if (lastAction.data.type === 'observation') {
            observations.push(lastAction.data.item);
        }
    } else if (lastAction.type === 'edit') {
        const item = lastAction.data.item;
        if (lastAction.data.type === 'action') {
            const index = actions.findIndex(a => a.id === item.id);
            if (index !== -1) {
                actions[index] = lastAction.data.original;
            }
        } else if (lastAction.data.type === 'request') {
            const index = infoRequests.findIndex(r => r.id === item.id);
            if (index !== -1) {
                infoRequests[index] = lastAction.data.original;
            }
        } else if (lastAction.data.type === 'observation') {
            const index = observations.findIndex(o => o.id === item.id);
            if (index !== -1) {
                observations[index] = lastAction.data.original;
            }
        }
    }
    updateActionsDisplay();
    updateRequestsDisplay();
    updateObservationsDisplay();
    saveData();
    showToast('Undone');
}

function deleteAction(actionId) {
    const action = actions.find(a => a.id === actionId);
    if (!action) return;

    // CRITICAL-4: Check if action is submitted
    if (action.status === 'submitted') {
        showToast('Cannot delete submitted actions');
        return;
    }

    if (!confirm('Delete this action?')) return;

    pushToUndoStack('delete', { type: 'action', item: action });
    actions = actions.filter(a => a.id !== actionId);
    // Re-sequence action numbers
    actions.forEach((a, index) => {
        a.number = index + 1;
    });
    updateActionsDisplay();
    saveData();
    showToast('Action deleted');
}

// Edit mode state management
let editMode = {
    active: false,
    actionId: null,
    originalAction: null
};

function editAction(actionId) {
    const action = actions.find(a => a.id === actionId);
    if (!action) return;

    // CRITICAL-4: Check if action is submitted
    if (action.status === 'submitted') {
        showToast('Cannot edit submitted actions');
        return;
    }

    // If already in edit mode, cancel previous edit
    if (editMode.active && editMode.actionId !== actionId) {
        if (!confirm('Cancel current edit and start new edit?')) return;
        cancelEdit();
    }

    // Enter edit mode
    editMode.active = true;
    editMode.actionId = actionId;
    editMode.originalAction = JSON.parse(JSON.stringify(action));

    // Populate form with action data
    document.getElementById('actionMechanism').value = action.mechanism || '';
    document.getElementById('actionSector').value = action.sector || '';
    document.getElementById('actionGoal').value = action.goal || '';
    document.getElementById('actionOutcomes').value = action.outcomes || '';
    document.getElementById('actionContingencies').value = action.contingencies || '';
    document.getElementById('actionExposure').value = action.exposure || '';

    // Select targets
    document.querySelectorAll('.target-checkbox').forEach(btn => {
        btn.classList.toggle('selected', action.targets?.includes(btn.getAttribute('data-target')));
    });

    // Update UI to show edit mode
    const submitButton = document.querySelector('button[onclick*="addAction"]');
    if (submitButton) {
        submitButton.textContent = 'Update Action';
        submitButton.onclick = saveEditedAction;
    }

    // Scroll to form
    const formElement = document.getElementById('actionMechanism');
    if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    showToast('Edit mode: Make changes and click "Update Action" to save');
}

function cancelEdit() {
    if (!editMode.active) return;

    // Restore form
    document.getElementById('actionMechanism').value = '';
    document.getElementById('actionSector').value = '';
    document.getElementById('actionGoal').value = '';
    document.getElementById('actionOutcomes').value = '';
    document.getElementById('actionContingencies').value = '';
    document.getElementById('actionExposure').value = '';
    document.querySelectorAll('.target-checkbox').forEach(btn => btn.classList.remove('selected'));

    // Restore button
    const submitButton = document.querySelector('button[onclick*="addAction"], button[onclick*="saveEditedAction"]');
    if (submitButton) {
        submitButton.textContent = 'Add Action';
        submitButton.onclick = addAction;
    }

    editMode.active = false;
    editMode.actionId = null;
    editMode.originalAction = null;
}

async function saveEditedAction() {
    if (!editMode.active || !editMode.actionId) {
        showToast('Not in edit mode');
        return;
    }

    const mechanism = document.getElementById('actionMechanism').value;
    const sector = document.getElementById('actionSector').value;
    const goal = document.getElementById('actionGoal').value.trim();
    const outcomes = document.getElementById('actionOutcomes').value.trim();
    const contingencies = document.getElementById('actionContingencies').value.trim();
    const exposure = document.getElementById('actionExposure').value;

    // HIGH-3: Enhanced field-by-field validation with visual feedback
    if (!mechanism) {
        validateField('actionMechanism', false, 'Please select a mechanism');
        showToast('Please select a mechanism');
        return;
    }
    validateField('actionMechanism', true);

    if (!sector) {
        validateField('actionSector', false, 'Please select a sector');
        showToast('Please select a sector');
        return;
    }
    validateField('actionSector', true);

    if (!exposure) {
        validateField('actionExposure', false, 'Please select a type of exposure');
        showToast('Please select a type of exposure');
        return;
    }
    validateField('actionExposure', true);

    const selectedTargets = Array.from(document.querySelectorAll('.target-checkbox.selected'))
        .map(btn => btn.getAttribute('data-target'));

    if (selectedTargets.length === 0) {
        showToast('Please select at least one target');
        return;
    }

    if (!goal) {
        validateField('actionGoal', false, 'Please enter a goal for this action');
        showToast('Please enter a goal for this action');
        return;
    }
    validateField('actionGoal', true);

    if (goal.length < 10) {
        validateField('actionGoal', false, 'Goal must be at least 10 characters');
        showToast('Goal must be at least 10 characters');
        return;
    }
    validateField('actionGoal', true);

    if (!outcomes) {
        validateField('actionOutcomes', false, 'Please describe the expected outcomes');
        showToast('Please describe the expected outcomes');
        return;
    }
    validateField('actionOutcomes', true);

    if (outcomes.length < 10) {
        validateField('actionOutcomes', false, 'Expected outcomes must be at least 10 characters');
        showToast('Expected outcomes must be at least 10 characters');
        return;
    }
    validateField('actionOutcomes', true);

    if (!contingencies) {
        validateField('actionContingencies', false, 'Please describe ally contingencies');
        showToast('Please describe ally contingencies');
        return;
    }
    validateField('actionContingencies', true);

    if (contingencies.length < 10) {
        validateField('actionContingencies', false, 'Ally contingencies must be at least 10 characters');
        showToast('Ally contingencies must be at least 10 characters');
        return;
    }
    validateField('actionContingencies', true);

    // Check session
    if (hasUtil && !currentSessionId) {
        handleUserError('Please join a session first before updating actions.');
        showSessionJoinPrompt();
        return;
    }

    // Update via database/data-layer
    if (hasUtil && currentSessionId) {
        try {
            const updateData = {
                mechanism: mechanism,
                sector: sector,
                exposure: exposure,
                targets: selectedTargets,
                goal: goal,
                outcomes: outcomes,
                contingencies: contingencies
                // Note: We don't update status here - it remains as is (draft/submitted/adjudicated)
            };

            const success = await window.esg.updateAction(editMode.actionId, updateData);

            if (success) {
                // HIGH-2: Log participant activity
                if (window.researchTracking && window.researchTracking.logParticipantActivity) {
                    await window.researchTracking.logParticipantActivity(
                        currentSessionId,
                        window.esg.getClientId(),
                        'action_edited',
                        { action_id: editMode.actionId, mechanism: mechanism, sector: sector }
                    );
                }

                if (window.esg.showToast) {
                    window.esg.showToast('Action updated successfully');
                }

                // Reload from database to get the updated action
                await loadData();

                // Exit edit mode
                cancelEdit();
            } else {
                handleUserError('Failed to update action. Please try again.');
                return;
            }
        } catch (error) {
            console.error('Update action error:', error);
            await handleSystemError(error, 'Failed to update action');
            return;
        }
    } else {
        handleUserError('System Error: Data Layer not active.');
    }
}

// Make saveEditedAction globally available
window.saveEditedAction = saveEditedAction;


function deleteRequest(requestId) {
    const request = infoRequests.find(r => r.id === requestId);
    if (!request) return;
    if (!confirm('Delete this request?')) return;

    pushToUndoStack('delete', { type: 'request', item: request });
    infoRequests = infoRequests.filter(r => r.id !== requestId);

    // Update localStorage to notify White Cell
    const keySimple = getRequestsKey();
    try {
        const existing = safeGetItem(keySimple, []);
        const updated = existing.filter(r => r.id !== requestId);
        safeSetItem(keySimple, updated);

        // Notify White Cell via storage event marker
        localStorage.setItem('_requestDeleted', JSON.stringify({
            requestId: requestId,
            move: currentMove,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.error('Error updating request storage:', e);
    }

    updateRequestsDisplay();
    saveData();
    showToast('Request deleted');
}

function deleteObservation(obsId) {
    const obs = observations.find(o => o.id === obsId);
    if (!obs) return;
    if (!confirm('Delete this observation?')) return;

    pushToUndoStack('delete', { type: 'observation', item: obs });
    observations = observations.filter(o => o.id !== obsId);
    updateObservationsDisplay();
    saveData();
    showToast('Observation deleted');
}

function updateActionsDisplay() {
    const container = document.getElementById('currentActions');

    // Apply search and filter
    let filteredActions = actions;
    if (searchQuery) {
        filteredActions = searchItems(actions, searchQuery, ['goal', 'outcomes', 'contingencies', 'mechanism', 'sector']);
    }
    if (currentFilter !== 'all') {
        filteredActions = filteredActions.filter(a => a.phase === parseInt(currentFilter));
    }

    if (filteredActions.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        <p>${searchQuery || currentFilter !== 'all' ? 'No actions match your search/filter' : 'No actions recorded yet'}</p>
                        <p>${searchQuery || currentFilter !== 'all' ? 'Try a different search term or filter' : 'Actions will appear here when decided'}</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = filteredActions.map(action => {
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
                <div class="action-item" data-action-id="${action.id}">
                    <div class="action-header">
                        <span class="action-number">Action ${action.number}</span>
                        ${action.status === 'submitted' ? '<span style="padding: 2px 8px; background: #28a745; color: white; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">SUBMITTED</span>' : '<span style="padding: 2px 8px; background: #ffc107; color: #000; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">DRAFT</span>'}
                        <span>${action.timestamp}</span>
                        <div style="display: flex; gap: 8px; margin-left: auto;">
                            ${action.status === 'draft' ? `
                                <button onclick="submitAction('${action.id}')" style="padding: 4px 8px; font-size: 0.75rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Submit</button>
                                <button onclick="editAction('${action.id}')" style="padding: 4px 8px; font-size: 0.75rem; background: var(--color-primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Edit</button>
                                <button onclick="deleteAction('${action.id}')" style="padding: 4px 8px; font-size: 0.75rem; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
                            ` : ''}
                        </div>
                    </div>
                    <div><strong>Mechanism:</strong> ${mechanismNames[action.mechanism] || action.mechanism}</div>
                    <div><strong>Sector:</strong> ${sectorNames[action.sector] || action.sector}</div>
                    <div><strong>Targets:</strong> ${action.targets.join(', ').toUpperCase()}</div>
                    <div><strong>Type of Exposure:</strong> ${(
                {
                    'critical-minerals': 'Critical Minerals',
                    'supply-chain': 'Supply Chain',
                    'technologies': 'Technologies',
                    'manufacturing': 'Manufacturing'
                }[action.exposure]
            ) || action.exposure}</div>
                    <div><strong>Goal:</strong> ${action.goal}</div>
                    <div><strong>Expected Outcomes:</strong> ${action.outcomes}</div>
                    <div><strong>Ally Contingencies:</strong> ${action.contingencies}</div>
                </div>
            `}).join('');

    document.getElementById('actionsBadge').textContent = actions.length;
}

// Make functions globally available
window.addAction = addAction;
window.addObservation = addObservation;
window.deleteAction = deleteAction;
window.editAction = editAction;
window.deleteRequest = deleteRequest;
window.deleteObservation = deleteObservation;
window.undoLastAction = undoLastAction;

function updateActionNumber() {
    document.getElementById('actionNumber').value = `Action ${actions.length + 1}`;
}

// Observations management
function addObservation() {
    const category = document.getElementById('observationCategory').value;
    const text = document.getElementById('newObservationText').value.trim();

    if (!category || !text) {
        handleUserError('Please select a category and provide observation details.');
        return;
    }

    const observation = {
        id: Date.now(),
        category: category,
        text: text,
        phase: currentPhase,
        timestamp: new Date().toLocaleString()
    };

    observations.push(observation);
    updateObservationsDisplay();
    updateTimeline(); // Update timeline when observation is added
    document.getElementById('observationCategory').value = '';
    document.getElementById('newObservationText').value = '';
    saveData();
}

function updateObservationsDisplay() {
    const container = document.getElementById('keyObservations');
    if (observations.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                        <p>No observations recorded yet</p>
                        <p>Key insights will appear here when added</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = observations.map(obs => {
        const categoryNames = {
            'strategic': 'Strategic Insights',
            'team': 'Team Dynamics',
            'technical': 'Technical Issues',
            'decision': 'Decision Points',
            'risk': 'Risk Assessment',
            'communication': 'Communication Patterns',
            'resource': 'Resource Allocation',
            'timeline': 'Timeline Issues'
        };
        return `
                <div class="action-item" data-observation-id="${obs.id}">
                    <div class="action-header">
                        <span class="action-number">Observation ${observations.indexOf(obs) + 1}</span>
                        <span class="category-tag">${categoryNames[obs.category] || obs.category}</span>
                        <span>${obs.timestamp}</span>
                        <div style="display: flex; gap: 8px; margin-left: auto;">
                            <button onclick="deleteObservation(${obs.id})" style="padding: 4px 8px; font-size: 0.75rem; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
                        </div>
                    </div>
                    <div>${obs.text}</div>
                </div>
            `}).join('');

    document.getElementById('observationsBadge').textContent = observations.length;
}

// Use a single global toast implementation defined later; remove local duplicate

async function saveData() {
    if (isResetting) return;
    try {
        const key = getFacilitatorKey();

        // Use atomic update to prevent concurrent write conflicts
        const success = atomicUpdate(key, (current) => {
            // Merge new data with existing data
            return {
                move: currentMove,
                phase: currentPhase,
                actions: actions,
                infoRequests: infoRequests,
                observations: observations,
                _version: current._version || 0 // Preserve version (will be incremented by atomicUpdate)
            };
        });

        if (!success) {
            throw new Error('Failed to save data to storage (concurrent write conflict)');
        }

        // Auto-save to data_storage folder (throttled - only every 30 seconds)
        if (typeof autoSaveFacilitatorData === 'function') {
            const lastSave = localStorage.getItem(`lastAutoSave_facilitator_${currentMove}`);
            const now = Date.now();
            if (!lastSave || (now - parseInt(lastSave)) > 30000) {
                autoSaveFacilitatorData && autoSaveFacilitatorData(undefined, currentMove);
                localStorage.setItem(`lastAutoSave_facilitator_${currentMove}`, now.toString());
            }
        }
    } catch (e) {
        console.error('Failed to save data', e);
        if (e.name === 'QuotaExceededError') {
            alert('Browser storage is full. Please clear some data or use a different browser.');
        } else {
            console.error('Unexpected error saving data:', e);
        }
    }
}

// Search and filter functionality
let searchQuery = '';
let currentFilter = 'all';

function performSearch() {
    const query = document.getElementById('searchInput')?.value || '';
    searchQuery = query.toLowerCase();
    updateActionsDisplay();
    updateRequestsDisplay();
    updateObservationsDisplay();
}

function filterByType(type) {
    currentFilter = type;
    updateActionsDisplay();
    updateRequestsDisplay();
    updateObservationsDisplay();
}

async function exportData() {
    try {
        await saveData();

        // Export all moves, not just current (session removed)
        const allMoves = {};
        const allRequests = {};
        const allTimelineItems = [];

        for (let i = 1; i <= 3; i++) {
            const data = safeGetItem((window.buildMoveKey && buildMoveKey(i, 'facilitator')) || `actions_move_${i}`, null);
            if (data) {
                allMoves[i] = data;
            }

            // Include requests for each move
            const requests = safeGetItem(getRequestsKey(i), []);
            if (requests && requests.length > 0) {
                allRequests[i] = requests;
            }

            // Include timeline items from shared storage
            const timelineKey = `whiteCell_move_${i}`;
            const timelineData = safeGetItem(timelineKey, {});
            if (timelineData.timelineItems && Array.isArray(timelineData.timelineItems)) {
                const blueItems = timelineData.timelineItems.filter(item =>
                    item.team === 'blue' || item.team === 'BLUE'
                );
                allTimelineItems.push(...blueItems.map(item => ({ ...item, move: i })));
            }
        }

        if (Object.keys(allMoves).length === 0 && Object.keys(allRequests).length === 0) {
            handleUserError('No data to export. Please add some data first.');
            return;
        }

        const exportData = {
            exported: new Date().toISOString(),
            exportedBy: 'BLUE Team Facilitator',
            allMoves: allMoves,
            allRequests: allRequests,
            timelineItems: allTimelineItems,
            currentMove: currentMove,
            currentPhase: currentPhase,
            metadata: {
                exportVersion: '1.0',
                includesRequests: true,
                includesTimeline: true
            }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
        a.download = `BLUE_Facilitator_${timestamp}.json`;
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
window.exportData = exportData;

// Backup and recovery
function createBackupNow() {
    const sessionId = getSessionId();
    const backup = createBackup(sessionId);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${sessionId}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Backup created');
}

function restoreFromBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const backup = JSON.parse(event.target.result);
                if (restoreBackup(backup)) {
                    loadData();
                    showToast('Backup restored');
                } else {
                    alert('Failed to restore backup');
                }
            } catch (e) {
                alert('Invalid backup file');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

window.createBackupNow = createBackupNow;
window.restoreFromBackup = restoreFromBackup;
window.performSearch = performSearch;
window.filterByType = filterByType;

async function sendToWhiteCell() {
    let loadingStop = null;
    try {
        // Show loading state
        const submitButton = document.querySelector('button[onclick*="sendToWhiteCell"]');
        if (submitButton && typeof setButtonLoading === 'function') {
            loadingStop = setButtonLoading(submitButton, 'Submitting...');
        }

        await saveData();

        const data = safeGetItem(getFacilitatorKey(), null);

        if (!data || !data.actions || data.actions.length === 0) {
            alert('No actions to submit. Please add at least one action before submitting.');
            if (loadingStop && typeof loadingStop === 'function') loadingStop();
            return;
        }

        // Comprehensive validation before submission
        const actionCount = data.actions.length;
        const requestCount = (data.infoRequests || []).length;
        const observationCount = (data.observations || []).length;

        // Validate each action has required fields
        const invalidActions = [];
        data.actions.forEach((action, index) => {
            const requiredFields = ['mechanism', 'sector', 'goal', 'outcomes', 'contingencies', 'exposure'];
            const missingFields = requiredFields.filter(field => !action[field] || action[field].trim() === '');
            if (missingFields.length > 0) {
                invalidActions.push({
                    index: index + 1,
                    missingFields: missingFields
                });
            }
            // Validate targets exist
            if (!action.targets || !Array.isArray(action.targets) || action.targets.length === 0) {
                if (!invalidActions.find(a => a.index === index + 1)) {
                    invalidActions.push({
                        index: index + 1,
                        missingFields: ['targets']
                    });
                } else {
                    invalidActions.find(a => a.index === index + 1).missingFields.push('targets');
                }
            }
        });

        if (invalidActions.length > 0) {
            const errorMsg = 'Validation failed. The following actions have missing required fields:\n\n' +
                invalidActions.map(a => `Action ${a.index}: Missing ${a.missingFields.join(', ')}`).join('\n') +
                '\n\nPlease complete all required fields before submitting.';
            alert(errorMsg);
            if (loadingStop && typeof loadingStop === 'function') loadingStop();
            return;
        }

        // Validate phase appropriateness (actions should typically be in phase 3)
        if (currentPhase < 3) {
            if (!confirm('You are submitting actions in Phase ' + currentPhase + '. Actions are typically submitted in Phase 3 (Finalization). Continue anyway?')) {
                if (loadingStop && typeof loadingStop === 'function') loadingStop();
                return;
            }
        }

        // Validate data integrity - check for corrupted or invalid JSON structures
        try {
            const testString = JSON.stringify(data);
            const testParse = JSON.parse(testString);
            if (!testParse.actions || !Array.isArray(testParse.actions)) {
                throw new Error('Invalid data structure: actions must be an array');
            }
        } catch (e) {
            alert('Data integrity check failed: ' + e.message + '\n\nPlease try saving and reloading the page.');
            if (loadingStop && typeof loadingStop === 'function') loadingStop();
            return;
        }

        // Persist a session-aware submission flag for WHITE reads
        const submissionData = {
            submittedAt: new Date().toISOString(),
            submittedBy: 'facilitator',
            count: actionCount,
            requestCount: requestCount,
            observationCount: observationCount,
            dataRef: getFacilitatorKey(),
            move: currentMove,
            phase: currentPhase
        };

        const submissionKey = getFacilitatorSubmissionKey();
        if (!safeSetItem(submissionKey, submissionData)) {
            alert('Failed to save submission. Please check browser storage.');
            if (loadingStop && typeof loadingStop === 'function') loadingStop();
            return;
        }

        // Best-effort legacy compatibility write when using new key shape
        if (submissionKey !== `blueActions_move_${currentMove}`) {
            safeSetItem(`blueActions_move_${currentMove}`, submissionData);
        }

        // Append canonical timeline event
        try {
            appendTimelineItem(currentMove, {
                phase: currentPhase, // Store as number, mapPhaseEnum is for display only
                type: 'action',
                title: `Facilitator submitted ${actionCount} actions`,
                content: `Actions: ${actionCount}, Requests: ${requestCount}, Observations: ${observationCount}`,
                team: 'blue',
                refs: { submittedBy: 'facilitator', actionCount, requestCount, observationCount }
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
            a.download = `BLUE_To_WHITE_Move${currentMove}_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Error creating export file:', e);
            // Continue even if export fails
        }

        // Auto-save to data_storage
        if (typeof autoSaveTeamSubmission === 'function') {
            await autoSaveTeamSubmission(undefined, currentMove, 'actions');
        }
        if (typeof autoSaveFacilitatorData === 'function') {
            await autoSaveFacilitatorData(undefined, currentMove);
        }

        showToast(`Successfully submitted ${actionCount} actions to WHITE Cell`);
        if (loadingStop && typeof loadingStop === 'function') loadingStop();

    } catch (error) {
        console.error('Error submitting to WHITE Cell:', error);
        const errorMsg = error.message || error.toString() || 'Unknown error';
        alert(`Error submitting data: ${errorMsg}. Please try again.`);
        showToast('Submission failed - please try again');
        if (loadingStop && typeof loadingStop === 'function') loadingStop();
    }
}

// Make function globally available
window.sendToWhiteCell = sendToWhiteCell;

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

// Timeline display function
function updateTimeline() {
    const container = document.getElementById('sessionTimeline');
    if (!container) return;

    const allTimelineItems = [];

    // Load timeline items from shared storage
    try {
        const key = `whiteCell_move_${currentMove}`;
        const data = safeGetItem(key, {});
        if (data.timelineItems && Array.isArray(data.timelineItems)) {
            // Filter for BLUE team items
            const blueItems = data.timelineItems.filter(item =>
                item.team === 'blue' || item.team === 'BLUE'
            );
            allTimelineItems.push(...blueItems);
        }

        // Also check for notetaker timeline items
        const notesKey = `notes_move_${currentMove}`;
        const notesData = safeGetItem(notesKey, {});
        if (notesData.timelineItems && Array.isArray(notesData.timelineItems)) {
            allTimelineItems.push(...notesData.timelineItems);
        }

        // Add facilitator actions as timeline items
        if (actions && actions.length > 0) {
            actions.forEach(action => {
                allTimelineItems.push({
                    type: 'action',
                    time: action.timestamp || new Date().toLocaleTimeString(),
                    timestamp: action.id || Date.now(),
                    phase: action.phase || currentPhase,
                    content: `Action ${action.number}: ${action.goal || 'No goal specified'}`,
                    team: 'blue'
                });
            });
        }

        // Add observations as timeline items
        if (observations && observations.length > 0) {
            observations.forEach(obs => {
                allTimelineItems.push({
                    type: 'observation',
                    time: obs.timestamp || new Date().toLocaleTimeString(),
                    timestamp: obs.id || Date.now(),
                    phase: obs.phase || currentPhase,
                    content: `${obs.category || 'Observation'}: ${obs.text || ''}`,
                    team: 'blue'
                });
            });
        }
    } catch (e) {
        console.error('Error loading timeline:', e);
    }

    // Deduplicate and sort
    const deduplicated = deduplicateTimelineItems(allTimelineItems);
    const sorted = deduplicated.sort((a, b) => {
        const timeA = a.timestamp || (a.time ? new Date(a.time).getTime() : 0);
        const timeB = b.timestamp || (b.time ? new Date(b.time).getTime() : 0);
        return timeB - timeA;
    });

    if (sorted.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <p>No timeline events</p>
                        <p>Timeline will populate as actions and observations are added</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = sorted.map(item => {
        const typeLabel = item.type === 'action' ? 'Action' :
            item.type === 'observation' ? 'Observation' :
                item.type === 'requestinfo' ? 'Info Request' :
                    item.type === 'note' ? 'Note' :
                        item.type === 'moment' ? 'Moment' :
                            item.type === 'quote' ? 'Quote' :
                                item.type === 'white_feedback' ? 'White Cell Feedback' : 'Event';

        let contentHtml = item.content || '';
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
                            <span class="timeline-time">Phase ${item.phase || currentPhase} | ${item.time || ''}</span>
                            <span class="timeline-type ${item.type}">${typeLabel}</span>
                        </div>
                        <div class="timeline-content">${contentHtml}</div>
                    </div>
                `;
    }).join('');
}

// Make updateTimeline available globally
window.updateTimeline = updateTimeline;

// Poll for game state updates every second
setInterval(updateGameStateFromShared, 1000);

// Initialize
updateGameStateFromShared();
updateTimeline();

async function loadData() {
    if (typeof window.esg !== 'undefined' && currentSessionId) {
        try {
            // Update Move/Phase
            const state = await window.esg.fetchGameState();
            if (state) {
                if (state.move) currentMove = state.move;
                if (state.phase) currentPhase = state.phase;

                const moveEpochEl = document.getElementById('moveEpoch');
                if (moveEpochEl && moveEpochs[currentMove]) moveEpochEl.textContent = moveEpochs[currentMove];
            }

            // Load Actions
            const fetchedActions = await window.esg.fetchActions(currentMove);
            if (fetchedActions) {
                actions = Array.isArray(fetchedActions) ? fetchedActions : [];
                // Sort by number
                actions.sort((a, b) => (a.number || 0) - (b.number || 0));
            }

            // Load Requests
            const fetchedRequests = await window.esg.fetchRequests();
            if (fetchedRequests) {
                infoRequests = Array.isArray(fetchedRequests) ? fetchedRequests : [];
            }

            // Load Observations (from Notetaker data if possible, or try legacy key)
            // For now, retaining legacy local read for observations to avoid data loss if not in data-layer
            const key = getFacilitatorKey();
            const localData = safeGetItem(key, {});
            if (localData && localData.observations) {
                observations = Array.isArray(localData.observations) ? localData.observations : [];
            }

        } catch (error) {
            console.error('Error loading data via data-layer:', error);
            // Fallback to local storage if data-layer fails
            loadDataLegacy();
        }
    } else {
        loadDataLegacy();
    }

    updateActionsDisplay();
    updateRequestsDisplay();
    updateObservationsDisplay();
    if (typeof updateActionNumber === 'function') updateActionNumber();
    if (typeof loadWhiteResponses === 'function') loadWhiteResponses();
}

function loadDataLegacy() {
    let savedData = safeGetItem(getFacilitatorKey(), null);
    if (!savedData) {
        savedData = safeGetItem(`actions_move_${currentMove}`, null);
    }
    if (!savedData) {
        savedData = safeGetItem(`blueFacilitatorMove${currentMove}`, null);
    }

    if (savedData) {
        const schema = {
            actions: { type: 'array', required: false, default: [] },
            infoRequests: { type: 'array', required: false, default: [] },
            observations: { type: 'array', required: false, default: [] },
            move: { type: 'number', required: false },
            phase: { type: 'number', required: false }
        };

        const validated = validateDataStrict(savedData, schema, false);
        if (validated) {
            actions = Array.isArray(validated.actions) ? validated.actions : [];
            infoRequests = Array.isArray(validated.infoRequests) ? validated.infoRequests : [];
            observations = Array.isArray(validated.observations) ? validated.observations : [];
        }
    }
}

// Global Alias required by other functions
window.loadData = loadData;

async function loadWhiteResponses() {
    let dbResponses = [];

    if (hasUtil && currentSessionId) {
        try {
            // Load communications from database
            // Note: data-layer.js doesn't have fetchCommunications, so we'll need to add it or use a workaround
            // For now, we'll check actions for adjudications
            const dbActions = await window.esg.fetchActions(currentMove);
            const adjudicatedActions = dbActions.filter(a => a.status === 'adjudicated' && a.adjudication);

            dbResponses = adjudicatedActions.map(a => ({
                summary: `Action Adjudicated: ${a.mechanism}`,
                outcomes: a.adjudication.outcome || '',
                notes: a.adjudication.narrative || '',
                timestamp: a.updated_at || a.created_at
            }));

            // Load communications from database
            const dbCommunications = await window.esg.fetchCommunications();
            const comm = dbCommunications.filter(c => c.to_role === 'blue' || c.from_role === 'white');

            dbResponses = [
                ...dbResponses,
                ...comm.map(c => ({
                    summary: c.title || `Communication: ${c.type}`,
                    outcomes: '',
                    notes: c.content || '',
                    timestamp: c.created_at || c.timestamp
                }))
            ];
        } catch (error) {
            console.error('Load white responses error:', error);
        }
    }

    // ALWAYS check localStorage for feedback (White Cell may save there)
    const feedbackKey = `whiteCellFeedback_move_${currentMove}`;
    let localFeedback = [];
    try {
        const feedback = safeGetItem(feedbackKey, []);
        if (Array.isArray(feedback)) {
            localFeedback = feedback.map(f => ({
                summary: f.summary || f.title,
                outcomes: f.outcomes || '',
                notes: f.notes || f.content || '',
                timestamp: f.timestamp
            }));
        }
    } catch (error) {
        console.error('Error loading feedback from localStorage:', error);
    }

    // Merge database and localStorage responses
    whiteResponses = [...dbResponses, ...localFeedback]
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

    updateWhiteResponsesUI();
}

function loadWhiteResponsesFromLocalStorage() {
    const wcKey = (window.buildMoveKey && buildMoveKey(currentMove, 'whitecell')) || `whiteCell_move_${currentMove}`;
    const wcData = safeGetItem(wcKey, {});
    const commKey = `communications_move_${currentMove}`;
    const feedbackKey = `whiteCellFeedback_move_${currentMove}`;
    const comm = Array.isArray(wcData.communications_log) ? wcData.communications_log : safeGetItem(commKey, []);
    const feedback = Array.isArray(wcData.adjudications) ? wcData.adjudications : safeGetItem(feedbackKey, []);
    whiteResponses = [
        ...feedback.map(f => ({ summary: f.summary || f.title, outcomes: f.outcomes, notes: f.notes || f.narrative, timestamp: f.timestamp })),
        ...comm.map(c => ({ summary: c.title || c.summary, outcomes: c.outcomes || '', notes: c.content || c.notes, timestamp: c.timestamp }))
    ].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
}

function updateWhiteResponsesUI() {
    const badge = document.getElementById('whiteResponsesBadge');
    const container = document.getElementById('whiteResponsesContainer');
    badge.textContent = whiteResponses.length || 0;
    if (!whiteResponses.length) {
        container.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <p>No responses from WHITE Cell yet</p>
                        <p>Click refresh to check for updates</p>
                    </div>
                `;
        return;
    }
    container.innerHTML = whiteResponses.map((r, i) => `
                <div class="action-item">
                    <div class="action-header">
                        <span class="action-number">${r.summary || 'Response ' + (i + 1)}</span>
                        <span>${(r.timestamp || r.time || '')}</span>
                    </div>
                    <div style="font-size: 0.875rem; line-height: 1.5; margin-bottom: 8px;">
                        <strong>From:</strong> WHITE Cell<br>
                        <strong>To:</strong> BLUE Team<br>
                        <strong>Message:</strong> ${r.notes || r.summary || ''}
                    </div>
                    ${r.outcomes ? `<div><strong>Outcomes:</strong> ${r.outcomes}</div>` : ''}
                </div>
            `).join('');
}

document.getElementById('refreshWhiteResponses').addEventListener('click', loadWhiteResponses);

// Expose for test access
window.loadWhiteResponses = loadWhiteResponses;

// Toast notifications for new responses
let lastWhiteResponsesCount = 0;
// Use shared showToast from data-layer.js

async function pollWhiteResponses() {
    const prev = lastWhiteResponsesCount;
    await loadWhiteResponses();
    const curr = whiteResponses.length;
    if (curr > prev && prev !== 0) {
        showToast(`New WHITE Cell responses: +${curr - prev}`);
    }
    lastWhiteResponsesCount = curr;
}

// Start a light poll every 10s (reduced from 30s for better responsiveness)
// Also listen for storage events for immediate updates
setInterval(pollWhiteResponses, 10000);

// Listen for storage events for immediate updates
window.addEventListener('storage', (e) => {
    if (e.key && (e.key.includes('communications_') || e.key.includes('whiteCellFeedback_'))) {
        loadWhiteResponses();
    }
    // Listen for game state changes from White Cell (move/phase)
    if (e.key === getSharedGameStateKey() || e.key === 'sharedGameState') {
        updateGameStateFromShared();
    }
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

// Initialize Session & Database Integration
async function initializeFacilitator() {
    // Check if data-layer.js is available
    if (hasUtil) {
        // Check for existing session
        currentSessionId = sessionStorage.getItem('esg_session_id');
        if (currentSessionId) {
            // Update last_seen in session metadata
            try {
                const clientId = sessionStorage.getItem('esg_client_id');
                if (!clientId) {
                    console.warn('Facilitator: No client ID found in sessionStorage');
                } else {
                    console.log('Facilitator: Updating participant status', { clientId, sessionId: currentSessionId });
                    const currentMetadata = await window.esg.getSessionMetadata();
                    console.log('Facilitator: Current metadata', currentMetadata);
                    const participants = currentMetadata?.participants || {};
                    const role = sessionStorage.getItem('esg_role') || 'blue_facilitator';

                    participants[clientId] = {
                        ...participants[clientId],
                        role: role,
                        last_seen: new Date().toISOString(),
                        joined_at: participants[clientId]?.joined_at || new Date().toISOString()
                    };
                    console.log('Facilitator: Updated participants object', participants);
                    const success = await window.esg.updateSessionMetadata({ participants });
                    console.log('Facilitator: Metadata update result', success);
                }
            } catch (error) {
                console.error('Error updating participant status:', error);
            }

            await updateSessionStatus();
            await loadData();
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
                    loadData();
                }
                if (newState.phase !== currentPhase) {
                    currentPhase = newState.phase;
                    updatePhaseGuidance();
                    document.querySelectorAll('.phase-btn').forEach(btn => {
                        if (parseInt(btn.getAttribute('data-phase')) === currentPhase) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
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

async function joinSessionFromFacilitator() {
    if (!hasUtil) {
        handleUserError('Database connection not available.');
        return;
    }

    const input = document.getElementById('sessionIdInput');
    const sessionId = input ? input.value.trim() : '';

    if (!sessionId) {
        handleUserError('Please enter a session ID');
        return;
    }

    try {
        const success = await window.esg.joinSession(sessionId);
        if (success) {
            currentSessionId = sessionId;
            await updateSessionStatus();
            await loadData();
            setupRealtimeSubscriptions();
            const sessionControl = document.getElementById('sessionControlGroup');
            if (sessionControl) sessionControl.style.display = 'none';
            if (window.esg.showToast) window.esg.showToast('Joined session successfully');
        } else {
            handleUserError('Failed to join session. Please check the session ID.');
        }
    } catch (error) {
        console.error('Join session error:', error);
        await handleSystemError(error, 'Failed to join session');
    }
}

window.joinSessionFromFacilitator = joinSessionFromFacilitator;





function setupRealtimeSubscriptions() {
    if (!hasUtil || !currentSessionId) return;

    // Subscribe to actions
    window.esg.subscribeToActions((payload) => {
        const eventType = payload.eventType || (payload.new ? 'UPDATE' : 'INSERT');
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            loadDataFromDatabase();
        }
    });

    // Subscribe to requests
    window.esg.subscribeToRequests((payload) => {
        const eventType = payload.eventType || (payload.new ? 'UPDATE' : 'INSERT');
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            loadDataFromDatabase();
        }
    });

    // Subscribe to communications (white cell responses)
    window.esg.subscribeToCommunications((comm) => {
        loadWhiteResponses();
    });
}

// Flag to prevent saving during reset
let isResetting = false;

// Listen for storage changes (specifically for hard reset)
window.addEventListener('storage', (e) => {
    // Check for full wipe (key is null)
    if (e.key === null) {
        console.log('Storage cleared, reloading...');
        isResetting = true;
        window.location.reload();
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeFacilitator();

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

updateTimer();
updatePhaseGuidance();

// Standardized loader hide
window.addEventListener('load', function () {
    setTimeout(function () {
        const loader = document.getElementById('loader');
        if (loader && !loader.classList.contains('hidden')) {
            loader.classList.add('hidden');
        }
    }, 1500);
});
