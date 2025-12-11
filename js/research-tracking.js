/**
 * research-tracking.js - Research Data Collection Integration
 * 
 * Integrates with the new research schema tables to automatically track:
 * 1. Participant management and demographics
 * 2. Action lifecycle timestamps
 * 3. Phase/move transitions
 * 4. Participant activity events
 * 5. Data completeness checks
 * 6. Action relationships
 * 
 * This module extends data-layer.js with research-specific tracking.
 */

// ==========================================
// 1. PARTICIPANT TRACKING
// ==========================================

/**
 * Register or update a participant in the database
 * @param {string} clientId - Unique client identifier
 * @param {object} options - Participant details (name, role, demographics)
 */
async function registerParticipant(clientId, options = {}) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) {
        console.warn('Participant tracking requires Supabase connection');
        return null;
    }

    const participantData = {
        client_id: clientId,
        name: options.name || null,
        role: options.role || sessionStorage.getItem('esg_role'),
        demographics: options.demographics || {}
    };

    try {
        // Upsert participant (insert or update if exists)
        const { data, error } = await db
            .from('participants')
            .upsert([participantData], { onConflict: 'client_id' })
            .select()
            .single();

        if (error) throw error;

        console.log('Participant registered:', data);
        return data;
    } catch (error) {
        console.error('Error registering participant:', error);
        return null;
    }
}

/**
 * Track participant joining a session
 * @param {string} sessionId - Session UUID
 * @param {string} clientId - Client identifier
 * @param {string} role - Participant role
 */
async function trackSessionJoin(sessionId, clientId, role) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    try {
        // First ensure participant exists
        const participant = await registerParticipant(clientId, { role });
        if (!participant) return null;

        // Record session participation
        const { data, error } = await db
            .from('session_participants')
            .upsert([{
                session_id: sessionId,
                participant_id: participant.id,
                role: role,
                joined_at: new Date().toISOString(),
                last_seen: new Date().toISOString()
            }], { onConflict: 'session_id,participant_id' })
            .select()
            .single();

        if (error) throw error;

        // Log activity event
        await logParticipantActivity(sessionId, clientId, 'login');

        console.log('Session participation tracked:', data);
        return data;
    } catch (error) {
        console.error('Error tracking session join:', error);
        return null;
    }
}

/**
 * Update participant's last seen timestamp and heartbeat
 * @param {string} sessionId - Session UUID
 * @param {string} clientId - Client identifier
 */
async function updateParticipantHeartbeat(sessionId, clientId) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return;

    try {
        const { data: participant } = await db
            .from('participants')
            .select('id')
            .eq('client_id', clientId)
            .single();

        if (!participant) return;

        // Update both last_seen and heartbeat_at for role slot management
        await db
            .from('session_participants')
            .update({
                last_seen: new Date().toISOString(),
                heartbeat_at: new Date().toISOString()
            })
            .eq('session_id', sessionId)
            .eq('participant_id', participant.id)
            .eq('is_active', true);
    } catch (error) {
        console.error('Error updating participant heartbeat:', error);
    }
}


// ==========================================
// 2. PARTICIPANT ACTIVITY LOGGING
// ==========================================

/**
 * Log a participant activity event
 * @param {string} sessionId - Session UUID
 * @param {string} clientId - Client identifier
 * @param {string} eventType - Type of event (login, logout, action_created, etc.)
 * @param {object} metadata - Additional event context
 * @param {number} duration - Duration in seconds (optional)
 */
async function logParticipantActivity(sessionId, clientId, eventType, metadata = {}, duration = null) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    const validEventTypes = ['login', 'logout', 'action_created', 'action_submitted',
        'rfi_created', 'observation_added', 'page_view', 'idle'];

    if (!validEventTypes.includes(eventType)) {
        console.warn('Invalid event type:', eventType);
        return null;
    }

    try {
        // Get participant ID
        const { data: participant } = await db
            .from('participants')
            .select('id')
            .eq('client_id', clientId)
            .single();

        const activityData = {
            session_id: sessionId,
            participant_id: participant?.id || null,
            client_id: clientId,
            event_type: eventType,
            event_timestamp: new Date().toISOString(),
            metadata: metadata,
            duration_seconds: duration
        };

        const { data, error } = await db
            .from('participant_activity')
            .insert([activityData])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error logging participant activity:', error);
        return null;
    }
}

// ==========================================
// 3. GAME STATE TRANSITION TRACKING
// ==========================================

/**
 * Track a phase or move transition
 * @param {string} sessionId - Session UUID
 * @param {string} transitionType - 'move' or 'phase'
 * @param {number} fromValue - Previous value
 * @param {number} toValue - New value
 * @param {string} clientId - Who initiated the transition
 * @param {string} reason - Reason for transition (manual, auto, completion)
 * @param {number} previousDuration - Duration of previous phase in seconds
 */
async function trackGameStateTransition(sessionId, transitionType, fromValue, toValue, clientId, reason = 'manual', previousDuration = null) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    try {
        const transitionData = {
            session_id: sessionId,
            transition_type: transitionType,
            from_value: fromValue,
            to_value: toValue,
            initiated_by_client_id: clientId,
            initiated_by_role: sessionStorage.getItem('esg_role'),
            transition_reason: reason,
            created_at: new Date().toISOString(),
            previous_phase_duration_seconds: previousDuration,
            metadata: {}
        };

        const { data, error } = await db
            .from('game_state_transitions')
            .insert([transitionData])
            .select()
            .single();

        if (error) throw error;

        console.log('Game state transition tracked:', data);
        return data;
    } catch (error) {
        console.error('Error tracking game state transition:', error);
        return null;
    }
}

// ==========================================
// 4. ACTION LIFECYCLE TRACKING
// ==========================================

/**
 * Update action with lifecycle timestamps
 * @param {string} actionId - Action UUID
 * @param {string} status - New status (draft, submitted, adjudicated)
 * @param {object} previousAction - Previous action state for calculating durations
 */
async function updateActionLifecycle(actionId, status, previousAction = null) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    try {
        const now = new Date().toISOString();
        const updates = {};

        // Calculate timestamps and durations based on status
        if (status === 'submitted' && previousAction) {
            updates.submitted_at = now;

            // Calculate draft duration
            if (previousAction.created_at) {
                const createdTime = new Date(previousAction.created_at);
                const submittedTime = new Date(now);
                updates.draft_duration_seconds = Math.floor((submittedTime - createdTime) / 1000);
            }
        } else if (status === 'adjudicated' && previousAction) {
            updates.adjudicated_at = now;

            // Calculate submission to adjudication duration
            if (previousAction.submitted_at) {
                const submittedTime = new Date(previousAction.submitted_at);
                const adjudicatedTime = new Date(now);
                updates.submission_to_adjudication_seconds = Math.floor((adjudicatedTime - submittedTime) / 1000);
            }
        }

        if (Object.keys(updates).length === 0) return null;

        const { data, error } = await db
            .from('actions')
            .update(updates)
            .eq('id', actionId)
            .select()
            .single();

        if (error) throw error;

        console.log('Action lifecycle updated:', data);
        return data;
    } catch (error) {
        console.error('Error updating action lifecycle:', error);
        return null;
    }
}

/**
 * Enhanced action log with status transitions
 * @param {string} actionId - Action UUID
 * @param {string} sessionId - Session UUID
 * @param {string} clientId - Client identifier
 * @param {string} statusFrom - Previous status
 * @param {string} statusTo - New status
 * @param {object} previousState - Previous action state
 * @param {object} newState - New action state
 */
async function logActionTransition(actionId, sessionId, clientId, statusFrom, statusTo, previousState, newState) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    try {
        // Calculate transition duration if both states have timestamps
        let transitionDuration = null;
        if (previousState?.updated_at && newState?.updated_at) {
            const prevTime = new Date(previousState.updated_at);
            const newTime = new Date(newState.updated_at);
            transitionDuration = Math.floor((newTime - prevTime) / 1000);
        }

        const logData = {
            action_id: actionId,
            session_id: sessionId,
            client_id: clientId,
            changed_by_role: sessionStorage.getItem('esg_role'),
            previous_state: previousState,
            new_state: newState,
            status_from: statusFrom,
            status_to: statusTo,
            transition_duration_seconds: transitionDuration,
            created_at: new Date().toISOString()
        };

        const { data, error } = await db
            .from('action_logs')
            .insert([logData])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error logging action transition:', error);
        return null;
    }
}

// ==========================================
// 5. ACTION RELATIONSHIP TRACKING
// ==========================================

/**
 * Link two actions with a relationship
 * @param {string} sessionId - Session UUID
 * @param {string} sourceActionId - Source action UUID
 * @param {string} targetActionId - Target action UUID (optional)
 * @param {string} relationshipType - Type: influenced_by, response_to, follows, replaces, refines
 * @param {object} metadata - Additional context
 */
async function linkActions(sessionId, sourceActionId, targetActionId, relationshipType, metadata = {}) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    const validTypes = ['influenced_by', 'response_to', 'follows', 'replaces', 'refines'];
    if (!validTypes.includes(relationshipType)) {
        console.warn('Invalid relationship type:', relationshipType);
        return null;
    }

    try {
        const relationshipData = {
            session_id: sessionId,
            source_action_id: sourceActionId,
            target_action_id: targetActionId,
            relationship_type: relationshipType,
            created_at: new Date().toISOString(),
            metadata: metadata
        };

        const { data, error } = await db
            .from('action_relationships')
            .insert([relationshipData])
            .select()
            .single();

        if (error) throw error;

        console.log('Action relationship created:', data);
        return data;
    } catch (error) {
        console.error('Error linking actions:', error);
        return null;
    }
}

/**
 * Link an RFI to an action it informed
 * @param {string} sessionId - Session UUID
 * @param {string} requestId - RFI UUID
 * @param {string} actionId - Action UUID
 * @param {string} linkType - How the RFI informed the action
 */
async function linkRFIToAction(sessionId, requestId, actionId, linkType = 'informed_by') {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    try {
        const linkData = {
            session_id: sessionId,
            request_id: requestId,
            action_id: actionId,
            link_type: linkType,
            created_at: new Date().toISOString()
        };

        const { data, error } = await db
            .from('rfi_action_links')
            .insert([linkData])
            .select()
            .single();

        if (error) throw error;

        console.log('RFI-Action link created:', data);
        return data;
    } catch (error) {
        console.error('Error linking RFI to action:', error);
        return null;
    }
}

// ==========================================
// 6. DATA COMPLETENESS TRACKING
// ==========================================

/**
 * Record a data completeness check
 * @param {string} sessionId - Session UUID
 * @param {number} move - Current move
 * @param {number} phase - Current phase
 * @param {string} checkType - Type of check (action_required, rfi_required, etc.)
 * @param {string} checkName - Name of the check
 * @param {boolean} isComplete - Whether the check passed
 * @param {array} missingFields - Array of missing field names
 * @param {object} metadata - Additional context
 */
async function recordCompletenessCheck(sessionId, move, phase, checkType, checkName, isComplete, missingFields = [], metadata = {}) {
    if (!window.esg || !window.esg.isSupabaseAvailable()) return null;

    try {
        const checkData = {
            session_id: sessionId,
            move: move,
            phase: phase,
            check_type: checkType,
            check_name: checkName,
            is_complete: isComplete,
            missing_fields: missingFields,
            checked_at: new Date().toISOString(),
            metadata: metadata
        };

        const { data, error } = await db
            .from('data_completeness_checks')
            .insert([checkData])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error recording completeness check:', error);
        return null;
    }
}

/**
 * Validate action completeness
 * @param {object} action - Action object to validate
 * @param {string} sessionId - Session UUID
 * @param {number} move - Current move
 * @param {number} phase - Current phase
 */
async function validateActionCompleteness(action, sessionId, move, phase) {
    const requiredFields = ['mechanism', 'sector', 'targets', 'goal', 'expected_outcomes'];
    const missingFields = requiredFields.filter(field => !action[field] ||
        (Array.isArray(action[field]) && action[field].length === 0));

    const isComplete = missingFields.length === 0;

    await recordCompletenessCheck(
        sessionId,
        move,
        phase,
        'action_required',
        'Action Field Validation',
        isComplete,
        missingFields,
        { action_id: action.id }
    );

    return isComplete;
}

// ==========================================
// 7. INTEGRATION WITH EXISTING DATA LAYER
// ==========================================

/**
 * Enhanced login with participant tracking
 */
async function enhancedLogin(role, password) {
    const success = window.esg.login(role, password);

    if (success) {
        const clientId = sessionStorage.getItem('esg_client_id');
        const sessionId = window.esg.getSessionId();

        // Register participant
        await registerParticipant(clientId, { role });

        // Track session join if session exists
        if (sessionId) {
            await trackSessionJoin(sessionId, clientId, role);
        }
    }

    return success;
}

/**
 * Enhanced logout with activity tracking
 */
async function enhancedLogout() {
    const sessionId = window.esg.getSessionId();
    const clientId = sessionStorage.getItem('esg_client_id');

    if (sessionId && clientId) {
        await logParticipantActivity(sessionId, clientId, 'logout');
    }

    window.esg.logout();
}

/**
 * Enhanced action submission with lifecycle and activity tracking
 */
async function enhancedSubmitAction(formData) {
    const sessionId = window.esg.getSessionId();
    const clientId = sessionStorage.getItem('esg_client_id');

    // Submit action using original function
    const success = await window.esg.submitAction(formData);

    if (success && sessionId && clientId) {
        // Log activity
        await logParticipantActivity(sessionId, clientId, 'action_submitted', {
            mechanism: formData.mechanism,
            sector: formData.sector
        });

        // Validate completeness
        const state = await window.esg.fetchGameState();
        await validateActionCompleteness(formData, sessionId, state.move, state.phase);
    }

    return success;
}

/**
 * Enhanced game state update with transition tracking
 */
async function enhancedUpdateGameState(updates) {
    const sessionId = window.esg.getSessionId();
    const clientId = sessionStorage.getItem('esg_client_id');

    if (sessionId && clientId && (updates.move !== undefined || updates.phase !== undefined)) {
        // Get current state before update
        const currentState = await window.esg.fetchGameState();

        // Track transitions
        if (updates.move !== undefined && updates.move !== currentState.move) {
            await trackGameStateTransition(
                sessionId,
                'move',
                currentState.move,
                updates.move,
                clientId,
                'manual'
            );
        }

        if (updates.phase !== undefined && updates.phase !== currentState.phase) {
            // Calculate phase duration if we have timestamp data
            const phaseDuration = null; // TODO: Calculate from phase start time

            await trackGameStateTransition(
                sessionId,
                'phase',
                currentState.phase,
                updates.phase,
                clientId,
                'manual',
                phaseDuration
            );
        }
    }

    // Call original function
    await window.esg.updateGameState(updates);
}

// ==========================================
// 8. HEARTBEAT & PERIODIC TRACKING
// ==========================================

let heartbeatInterval = null;

/**
 * Start periodic heartbeat to update participant last_seen
 */
function startParticipantHeartbeat() {
    if (heartbeatInterval) return; // Already running

    heartbeatInterval = setInterval(async () => {
        const sessionId = window.esg.getSessionId();
        const clientId = sessionStorage.getItem('esg_client_id');

        if (sessionId && clientId) {
            await updateParticipantHeartbeat(sessionId, clientId);
        }
    }, 30000); // Update every 30 seconds
}

/**
 * Stop heartbeat tracking
 */
function stopParticipantHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// ==========================================
// 9. PUBLIC API
// ==========================================

window.researchTracking = {
    // Participant Management
    registerParticipant,
    trackSessionJoin,
    updateParticipantHeartbeat,
    startParticipantHeartbeat,
    stopParticipantHeartbeat,

    // Activity Logging
    logParticipantActivity,

    // Game State Transitions
    trackGameStateTransition,

    // Action Lifecycle
    updateActionLifecycle,
    logActionTransition,

    // Relationships
    linkActions,
    linkRFIToAction,

    // Data Completeness
    recordCompletenessCheck,
    validateActionCompleteness,

    // Enhanced Functions (drop-in replacements)
    enhancedLogin,
    enhancedLogout,
    enhancedSubmitAction,
    enhancedUpdateGameState
};

// Auto-disconnect on page unload
window.addEventListener('beforeunload', async () => {
    const sessionId = window.esg?.getSessionId();
    const clientId = sessionStorage.getItem('esg_client_id');

    if (sessionId && clientId && window.esg?.disconnectParticipant) {
        // Disconnect participant when leaving page
        await window.esg.disconnectParticipant(sessionId, clientId);
    }

    stopParticipantHeartbeat();
});


console.log('Research Tracking module initialized');

// Extend window.esg with research functions to meet Unified Data Layer requirements
if (window.esg) {
    Object.assign(window.esg, window.researchTracking);

    // Explicit aliases for spec compliance
    window.esg.updateHeartbeat = updateParticipantHeartbeat;
    // Overwrite with enhanced version if signature matches
    window.esg.registerSessionParticipant = trackSessionJoin;
}


