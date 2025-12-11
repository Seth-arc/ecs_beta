# ESG-Demo Codebase Deep Review Prompt

## Purpose
You are an expert code auditor tasked with performing an exhaustive, granular review of the **ESG-Demo Economic Statecraft Simulation Platform** codebase. Your goal is to identify inconsistencies, gaps, incomplete implementations, ghost code, dead code, and problems across all files. This review must be systematic, thorough, and cross-reference the provided specification and database schema.

---

## Project Context Summary

**Application Type:** Multi-role, real-time wargaming simulation platform  
**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3, Supabase (PostgreSQL)  
**Primary Roles:** Game Master, Blue Team Facilitator, Blue Team Notetaker, Blue Team White Cell  
**Structure:** 3 Moves × 5 Phases per move, real-time collaboration with role-based access

---

## Review Scope &amp; Methodology

### Files to Review (in order of priority)

1. **Core Data Layer:**
   - `js/data-layer.js` (PRIMARY - unified data layer)

2. **Role-Specific Logic:**
   - `js/gamemaster.js`
   - `js/facilitator.js`
   - `js/notetaker.js`
   - `js/whitecell.js`

3. **Supporting Systems:**
   - `js/research-tracking.js`
   - `js/role-dialogs.js`
   - `js/app.js`
   - `js/autoSave.js`
   - `js/loading.js`
   - `js/modal-utils.js`

4. **HTML Interfaces:**
   - `index.html`
   - `master.html`
   - `teams/blue/blue_facilitator.html`
   - `teams/blue/blue_notetaker.html`
   - `teams/blue/blue_white_cell.html`

5. **Stylesheets:**
   - `styles/main.css`
   - `styles/simulation-theme.css`
   - `styles/master.css`
   - `styles/blue_facilitator.css`
   - `styles/blue_notetaker.css`
   - `styles/blue_whitecell.css`

---

## PART 1: DATA LAYER CONSISTENCY AUDIT

### 1.1 Database Schema vs. Code Alignment

For each of the following 17 database tables, verify that the JavaScript code correctly implements all CRUD operations with the proper field names, types, and constraints:

#### Tables to Audit:

| Table | Key Fields to Verify |
|-------|---------------------|
| `sessions` | `id (UUID)`, `name`, `status (active/archived/deleted)`, `metadata (JSONB)`, `created_at`, `updated_at` |
| `participants` | `id (UUID)`, `client_id (TEXT UNIQUE)`, `name`, `role`, `demographics (JSONB)`, `created_at`, `updated_at` |
| `session_participants` | `id`, `session_id (FK)`, `participant_id (FK)`, `role`, `joined_at`, `left_at`, `last_seen`, `total_active_time`, `contributions_count`, `is_active`, `heartbeat_at`, `disconnected_at` |
| `game_state` | `id`, `session_id (FK UNIQUE)`, `move (1-3)`, `phase (1-5)`, `timer_seconds`, `timer_running`, `timer_last_update`, `last_updated`, `created_at` |
| `actions` | `id`, `session_id (FK)`, `created_at`, `updated_at`, `move (1-3)`, `phase (1-5)`, `team`, `client_id`, `mechanism`, `sector`, `exposure_type`, `targets (TEXT[])`, `goal`, `expected_outcomes`, `ally_contingencies`, `status (draft/submitted/adjudicated/abandoned)`, `adjudication (JSONB)`, `submitted_at`, `adjudicated_at`, `draft_duration_seconds`, `submission_to_adjudication_seconds`, `is_deleted`, `deleted_at` |
| `action_logs` | `id`, `action_id (FK)`, `session_id (FK)`, `created_at`, `client_id`, `changed_by_role`, `previous_state (JSONB)`, `new_state (JSONB)`, `status_from`, `status_to`, `transition_duration_seconds` |
| `requests` | `id`, `session_id (FK)`, `created_at`, `move (1-3)`, `phase (1-5)`, `team`, `client_id`, `priority (NORMAL/HIGH/URGENT)`, `categories (TEXT[])`, `query`, `status (pending/answered/withdrawn)`, `answered_at`, `response_time_seconds` |
| `communications` | `id`, `session_id (FK)`, `created_at`, `move (1-3)`, `from_role`, `to_role`, `type (rfi_response/game_update/message)`, `title`, `content`, `client_id`, `linked_request_id (FK)` |
| `timeline` | `id`, `session_id (FK)`, `created_at`, `move (1-3)`, `phase (1-5)`, `team`, `type`, `content`, `client_id`, `category`, `faction_tag`, `debate_marker`, `metadata (JSONB)` |
| `notetaker_data` | `id`, `session_id (FK)`, `move (1-3)`, `phase (1-5)`, `team`, `client_id`, `dynamics_analysis (JSONB)`, `external_factors (JSONB)`, `observation_timeline (JSONB)`, `created_at`, `updated_at`, `UNIQUE(session_id, move)` |
| `reports` | `id`, `session_id (FK)`, `created_at`, `move (1-3)`, `phase (1-5)`, `author_role`, `client_id`, `report_type`, `data (JSONB)` |
| `move_completions` | `id`, `session_id (FK)`, `created_at`, `move (1-3)`, `team`, `submitted_at`, `final_action_count`, `final_timeline_count`, `submitted_by_role`, `client_id` |
| `game_state_transitions` | `id`, `session_id (FK)`, `transition_type (move/phase)`, `from_value`, `to_value`, `initiated_by_client_id`, `initiated_by_role`, `transition_reason`, `created_at`, `previous_phase_duration_seconds`, `metadata (JSONB)` |
| `participant_activity` | `id`, `session_id (FK)`, `participant_id (FK nullable)`, `client_id`, `event_type (login/logout/action_created/action_submitted/rfi_created/observation_added/page_view/idle)`, `event_timestamp`, `metadata (JSONB)`, `duration_seconds` |
| `data_completeness_checks` | `id`, `session_id (FK)`, `move`, `phase`, `check_type`, `check_name`, `is_complete`, `missing_fields (TEXT[])`, `checked_at`, `metadata (JSONB)` |
| `action_relationships` | `id`, `session_id (FK)`, `source_action_id (FK)`, `target_action_id (FK)`, `relationship_type (influenced_by/response_to/follows/replaces/refines)`, `created_at`, `metadata (JSONB)` |
| `rfi_action_links` | `id`, `session_id (FK)`, `request_id (FK)`, `action_id (FK)`, `link_type`, `created_at` |

**Review Checklist:**
- [ ] Are all table columns represented in JavaScript data models/objects?
- [ ] Are JSONB fields (`adjudication`, `dynamics_analysis`, `external_factors`, `observation_timeline`, `metadata`, `demographics`) correctly structured?
- [ ] Are TEXT[] array fields (`targets`, `categories`, `missing_fields`) handled correctly?
- [ ] Are enum constraints enforced in code (`status`, `priority`, `type`, `transition_type`, `event_type`, `relationship_type`)?
- [ ] Are FK relationships properly maintained when creating/updating records?
- [ ] Are `is_deleted` soft deletes properly filtered in queries?
- [ ] Is `created_at`/`updated_at` handling correct (database triggers vs. JS)?

### 1.2 window.esg API Completeness

Verify that `data-layer.js` exposes all required functions via `window.esg`:

**Required Session Functions:**
```javascript
window.esg.createSession(name, metadata)
window.esg.getSession(sessionId)
window.esg.getSessions()
window.esg.updateSession(sessionId, updates)
window.esg.deleteSession(sessionId)
window.esg.archiveSession(sessionId)
```

**Required Game State Functions:**
```javascript
window.esg.getGameState(sessionId)
window.esg.updateGameState(sessionId, { move, phase, timer_seconds, timer_running })
window.esg.subscribeToGameState(sessionId, callback)
```

**Required Action Functions:**
```javascript
window.esg.createAction(actionData)
window.esg.getActions(sessionId, filters)
window.esg.getAction(actionId)
window.esg.updateAction(actionId, updates)
window.esg.deleteAction(actionId)  // soft delete
window.esg.submitAction(actionId)
window.esg.adjudicateAction(actionId, adjudicationData)
window.esg.subscribeToActions(sessionId, callback)
```

**Required Request (RFI) Functions:**
```javascript
window.esg.createRequest(requestData)
window.esg.getRequests(sessionId, filters)
window.esg.getRequest(requestId)
window.esg.updateRequestStatus(requestId, status)
window.esg.withdrawRequest(requestId)
window.esg.subscribeToRequests(sessionId, callback)
```

**Required Communication Functions:**
```javascript
window.esg.createCommunication(commData)
window.esg.getCommunications(sessionId, filters)
window.esg.respondToRfi(requestId, responseContent)
window.esg.subscribeToCommunications(sessionId, callback)
```

**Required Timeline Functions:**
```javascript
window.esg.createTimelineEvent(eventData)
window.esg.getTimeline(sessionId, filters)
window.esg.subscribeToTimeline(sessionId, callback)
```

**Required Notetaker Functions:**
```javascript
window.esg.getNotetakerData(sessionId, move)
window.esg.saveNotetakerData(sessionId, move, data)
window.esg.saveObservation(sessionId, move, observation)
window.esg.saveDynamicsAnalysis(sessionId, move, dynamics)
window.esg.saveExternalFactors(sessionId, move, factors)
```

**Required Participant/Research Functions:**
```javascript
window.esg.registerParticipant(clientId, name, role)
window.esg.registerSessionParticipant(sessionId, participantId, role)
window.esg.updateHeartbeat(sessionParticipantId)
window.esg.disconnectParticipant(sessionParticipantId)
window.esg.checkRoleAvailability(sessionId, role)
window.esg.getActiveParticipants(sessionId, role)
window.esg.logParticipantActivity(sessionId, clientId, eventType, metadata)
```

**Required Export Functions:**
```javascript
window.esg.gatherSimulationData(sessionId)
window.esg.exportJSON(sessionId)
window.esg.exportCSV(sessionId)
window.esg.exportXLSX(sessionId)
window.esg.exportPDF(sessionId)
window.esg.exportZIP(sessionId)
```

**Required Utility Functions:**
```javascript
window.esg.generateClientId()
window.esg.getClientId()
window.esg.getSessionId()
window.esg.validateEnum(value, allowedValues)
window.esg.isSupabaseAvailable()
```

**Review Questions:**
- [ ] Are ALL above functions implemented in `data-layer.js`?
- [ ] Do function signatures match expected parameters?
- [ ] Are return types consistent (Promises, Objects, Arrays)?
- [ ] Is error handling consistent across all functions?
- [ ] Are localStorage fallbacks implemented for each database operation?

### 1.3 Deprecated File Usage Audit

**CRITICAL CHECK:** The specification states `util.js` and `utils.js` are DEPRECATED.

Search all files for:
- [ ] Any `import` or `<script>` reference to `util.js` or `utils.js`
- [ ] Any function calls to utilities that may have been in these deprecated files
- [ ] Duplicate function definitions between `data-layer.js` and deprecated files
- [ ] Inconsistent utility function naming across files

---

## PART 2: ROLE IMPLEMENTATION COMPLETENESS

### 2.1 Game Master (`gamemaster.js` + `master.html`)

**Required UI Sections:**
- [ ] Live Dashboard with real-time metrics
- [ ] Master Timeline (aggregated, filterable)
- [ ] Review Actions section
- [ ] RFI Management section
- [ ] Session Control (create, select, delete, archive)
- [ ] User Management (participant list)
- [ ] Game Control (move/phase, timer, export, reset)

**Required Functions:**
```javascript
// Session Management
createSession(name)
selectSession(sessionId)
deleteSession(sessionId)
archiveSession(sessionId)

// Dashboard
updateDashboardMetrics()
loadRecentActivity()
renderEmptyStates()

// Timeline
loadMasterTimeline()
filterTimeline(team, type, move)
subscribeToTimelineUpdates()

// Actions
loadAllActions()
viewActionDetails(actionId)
filterActions(status, team, move)

// RFIs
loadAllRequests()
respondToRequest(requestId, response)
filterRequests(status, priority)

// Game Control
advanceMove()
advancePhase()
resetPhase()
startTimer()
pauseTimer()
resetTimer()
hardReset()

// Export
exportFullArchive()
exportTabularData()
exportPdfSummary()
exportZipBundle()
gatherSimulationData()
```

**Review Questions:**
- [ ] Does each sidebar nav item correctly show/hide sections?
- [ ] Are all badge counters updating in real-time?
- [ ] Is the participant list showing active users with heartbeat status?
- [ ] Does hard reset require proper confirmation flow?
- [ ] Are export functions generating valid file outputs?

### 2.2 Blue Facilitator (`facilitator.js` + `blue_facilitator.html`)

**Required UI Sections:**
- [ ] Info Requests (RFI creation and list)
- [ ] Actions (create, edit draft, delete draft, submit)
- [ ] Observations (quick capture)
- [ ] Timeline (session history)
- [ ] White Responses (RFI responses view)

**Required Functions:**
```javascript
// RFI Management
createRfi(priority, categories, query)
withdrawRfi(requestId)
loadRfis()
subscribeToRfiUpdates()

// Action Management
createAction(mechanism, sector, exposureType, targets, goal, outcomes, contingencies)
editDraftAction(actionId)
deleteDraftAction(actionId)
submitAction(actionId)
loadActions()
subscribeToActionUpdates()

// Observations
saveObservation(type, content, faction)
loadObservations()

// Timeline
loadTimeline()
filterTimeline(type)

// White Responses
loadWhiteResponses()
subscribeToCommUpdates()
```

**Form Field Validation (per spec):**
- [ ] `mechanism`: One of [sanctions, export, investment, trade, financial, economic, industrial, infrastructure]
- [ ] `sector`: One of [biotechnology, agriculture, telecommunications, semiconductors, energy, finance]
- [ ] `exposure_type`: One of [Supply Chain, Cyber, Financial, Industrial, Trade]
- [ ] `targets`: Array, valid country codes (PRC, RUS, EU-GER, etc.)
- [ ] `priority`: One of [NORMAL, HIGH, URGENT]
- [ ] `status` transitions: DRAFT → SUBMITTED only (cannot edit SUBMITTED)

**Review Questions:**
- [ ] Can user edit/delete only DRAFT actions?
- [ ] Is SUBMITTED action read-only?
- [ ] Are RFI responses correctly linked via `linked_request_id`?
- [ ] Is move/phase read-only (controlled by White Cell)?
- [ ] Does timer display correctly (read-only)?

### 2.3 Blue Notetaker (`notetaker.js` + `blue_notetaker.html`)

**Required UI Sections:**
- [ ] Capture (observation entry)
- [ ] Timeline (chronological log)
- [ ] Dynamics (team analysis forms)
- [ ] Actions (read-only view)
- [ ] Alliance (external factors tracking)

**Required Data Structures:**

```javascript
// dynamics_analysis JSONB structure
{
  leadership: {
    primary_faction: "Executive" | "Legislative" | "VC",
    decision_style: "Consensus" | "Vote" | "Dictated",
    notes: string
  },
  friction_metrics: {
    debate_intensity: 1-10,
    deliberation_vs_execution: 1-10,
    coalition_impact: 1-10
  },
  resource_strategy: {
    posture: "Conserving" | "Deploying",
    rationale: string
  }
}

// external_factors JSONB structure
{
  alliance_feedback: {
    summary: string,
    blue_reaction: string
  },
  red_activity: {
    assessment: string,
    counter_measures: string
  },
  impact_assessments: string
}

// observation_timeline JSONB array structure
[
  {
    id: string,
    type: "NOTE" | "MOMENT" | "QUOTE",
    timestamp: ISO8601,
    phase: 1-5,
    content: string,
    faction_tag?: string
  }
]
```

**Review Questions:**
- [ ] Is `notetaker_data` table using `UNIQUE(session_id, move)` constraint correctly?
- [ ] Are slider inputs (1-10) correctly bound to friction_metrics?
- [ ] Is observation timeline an array that appends (not replaces)?
- [ ] Are Actions displayed as read-only (no submit button)?
- [ ] Is move completion submission tracked in `move_completions` table?

### 2.4 Blue White Cell (`whitecell.js` + `blue_white_cell.html`)

**Required UI Sections:**
- [ ] Timeline (multi-team view)
- [ ] Capture (quick observations)
- [ ] Requests (RFI management with response)
- [ ] Actions (review and adjudicate)
- [ ] Adjudication (outcome determination form)
- [ ] Communication (team messaging)

**Adjudication Data Structure:**
```javascript
// adjudication JSONB structure (stored in actions table)
{
  vulnerabilities: string[], // array of selected vulnerabilities
  interdependencies: {
    economic: string,
    technological: string,
    // additional fields as needed
  },
  structural_impacts: {
    technological_edge: string,
    industrial_base: string,
    supply_chain_resilience: string,
    alliance_coordination: string
  },
  outcome: "SUCCESS" | "PARTIAL_SUCCESS" | "FAIL" | "BACKFIRE",
  narrative: string,
  adjudicated_by: string, // client_id
  adjudicated_at: ISO8601
}
```

**Control Functions (White Cell Only):**
```javascript
// Move/Phase Control
setMove(move)  // 1, 2, or 3
setPhase(phase) // 1, 2, 3, 4, or 5
advancePhase()
regressPhase()

// Timer Control
startTimer()
pauseTimer()
resetTimer()
setTimerDuration(seconds)

// Adjudication
selectActionToAdjudicate(actionId)
submitAdjudication(actionId, adjudicationData)
```

**Review Questions:**
- [ ] Does White Cell have exclusive control over move/phase/timer?
- [ ] Are game_state_transitions logged on every move/phase change?
- [ ] Is adjudication correctly updating action status to "ADJUDICATED"?
- [ ] Are `adjudicated_at` and `submission_to_adjudication_seconds` calculated?
- [ ] Can White Cell see all teams' timelines?

---

## PART 3: RESEARCH &amp; PARTICIPANT TRACKING AUDIT

### 3.1 Heartbeat System (`research-tracking.js`)

**Required Implementation:**
```javascript
// Constants
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 120; // 2 minutes in seconds

// Functions
startParticipantHeartbeat(sessionParticipantId)
stopParticipantHeartbeat()
updateHeartbeat(sessionParticipantId) // updates heartbeat_at
detectStaleConnections(sessionId) // finds connections > 2 min old
cleanupStaleConnections(sessionId)
```

**Review Questions:**
- [ ] Is heartbeat started on successful login?
- [ ] Is heartbeat stopped on logout/page close?
- [ ] Is `beforeunload` event properly handling disconnect?
- [ ] Is `is_active` flag correctly set to `false` on disconnect?
- [ ] Is `disconnected_at` timestamp recorded?

### 3.2 Role Login System (`role-dialogs.js`)

**Required Functions:**
```javascript
checkRoleAvailability(sessionId, role)
showRoleTakeoverDialog(activeParticipants)
disconnectExistingParticipants(sessionId, role)
showRoleFullDialog(activeParticipants)
```

**Role Limits (per spec):**
```javascript
const ROLE_LIMITS = {
  'blue_facilitator': 1,
  'blue_whitecell': 1,
  'blue_notetaker': 2,
  'white': 1,
  'viewer': 999
};
```

**Review Questions:**
- [ ] Is role availability checked BEFORE allowing login?
- [ ] Does takeover dialog show currently active participants?
- [ ] Does takeover correctly disconnect existing participants?
- [ ] Is viewer role unlimited (999)?
- [ ] Does offline mode allow login (fail-open)?

### 3.3 Participant Activity Logging

**Required Events to Log:**
- [ ] `login` - User logs in
- [ ] `logout` - User logs out
- [ ] `action_created` - Draft action created
- [ ] `action_submitted` - Action submitted to White Cell
- [ ] `rfi_created` - RFI submitted
- [ ] `observation_added` - Observation captured
- [ ] `page_view` - Page/section viewed
- [ ] `idle` - User idle detection (if implemented)

**Review Questions:**
- [ ] Is `participant_activity` table receiving events?
- [ ] Is `metadata` JSONB populated with relevant context?
- [ ] Is `duration_seconds` calculated for timed events?
- [ ] Is `client_id` always present as fallback when `participant_id` unavailable?

---

## PART 4: REAL-TIME SUBSCRIPTION AUDIT

### 4.1 Supabase Realtime Subscriptions

Verify each subscription is:
1. Established on page load
2. Filtered by `session_id`
3. Properly handled (INSERT, UPDATE, DELETE)
4. Updating UI appropriately
5. Cleaned up on page unload

**Required Subscriptions per Role:**

| Role | Tables to Subscribe |
|------|---------------------|
| Game Master | `game_state`, `actions`, `requests`, `communications`, `timeline`, `session_participants` |
| Facilitator | `game_state`, `actions` (own team), `requests` (own), `communications` (to self) |
| Notetaker | `game_state`, `timeline` (own team), `actions` (read-only) |
| White Cell | `game_state`, `actions`, `requests`, `communications`, `timeline` (all teams) |

**Review Questions:**
- [ ] Is each subscription channel uniquely named with session_id?
- [ ] Are subscriptions unsubscribed on page unload?
- [ ] Is there error handling for subscription failures?
- [ ] Are localStorage events used as fallback for cross-tab sync?

### 4.2 localStorage Synchronization

**Required Shared Keys:**
```javascript
'esg:sharedState'     // { move, phase }
'esg:sharedTimer'     // { seconds, running, lastUpdate }
'_timelineUpdate'     // broadcast event trigger
```

**Review Questions:**
- [ ] Is `storage` event listener properly attached?
- [ ] Are shared keys being written correctly?
- [ ] Is timer calculation correct after page refresh?
- [ ] Is there race condition handling for concurrent writes?

---

## PART 5: UI/UX CONSISTENCY AUDIT

### 5.1 CSS Selector Alignment

For each HTML file, verify:
- [ ] All class names used in HTML exist in corresponding CSS
- [ ] All IDs used for JS targeting exist in HTML
- [ ] No orphan CSS rules (styling non-existent elements)
- [ ] Theme variables from `simulation-theme.css` are used consistently

### 5.2 JavaScript DOM Targeting

For each JS file, verify:
- [ ] All `document.getElementById()` calls have matching HTML elements
- [ ] All `document.querySelector()` selectors match HTML structure
- [ ] All `document.querySelectorAll()` selectors return expected elements
- [ ] Event listeners are attached to existing elements

### 5.3 Form Elements

For each form in the application, verify:
- [ ] All `<input>`, `<select>`, `<textarea>` have `name` or `id` attributes
- [ ] All form submissions are handled (prevented default + JS handling)
- [ ] All required fields have validation
- [ ] Error messages are displayed appropriately

### 5.4 Navigation &amp; Section Visibility

For each interface, verify:
- [ ] Sidebar navigation items toggle correct sections
- [ ] Only one section visible at a time (unless designed otherwise)
- [ ] Active nav item styling is applied
- [ ] Mobile responsiveness (if applicable)

---

## PART 6: ERROR HANDLING &amp; EDGE CASES

### 6.1 Connection Failure Handling

Verify implementation of:
- [ ] Supabase connection failure detection
- [ ] Automatic fallback to localStorage
- [ ] Offline indicator display
- [ ] Reconnection attempt logic
- [ ] Data queue for sync when reconnected

### 6.2 Storage Quota Handling

Verify implementation of:
- [ ] QuotaExceededError catch
- [ ] User notification
- [ ] Data export before clear option
- [ ] Graceful degradation

### 6.3 Concurrent Edit Handling

Verify implementation of:
- [ ] Last-write-wins strategy
- [ ] Real-time update notification to all clients
- [ ] Timestamp-based conflict resolution

### 6.4 Page Refresh During Timer

Verify implementation of:
- [ ] Timer state persistence to localStorage
- [ ] Elapsed time calculation on resume
- [ ] Maximum elapsed time cap (24 hours per spec)
- [ ] Timer display accuracy after refresh

### 6.5 Session Not Found

Verify implementation of:
- [ ] Detection of deleted/expired session
- [ ] Prompt to join new session
- [ ] Local data cleanup
- [ ] Redirect to session join

---

## PART 7: EXPORT FUNCTIONALITY AUDIT

### 7.1 Export Functions

Verify each export function:

**JSON Export:**
- [ ] Includes all moves (1-3)
- [ ] Includes all role data
- [ ] Follows schema structure from spec
- [ ] Valid JSON output

**CSV/XLSX Export:**
- [ ] Separate sheets/files for: Actions, RFIs, Observations, Timeline, Dynamics
- [ ] Headers match database columns
- [ ] Data properly escaped/formatted
- [ ] XLSX library (xlsx@0.18.5) used correctly

**PDF Export:**
- [ ] Tables render correctly
- [ ] jsPDF library (jspdf@2.5.1) used correctly
- [ ] Page breaks handled
- [ ] Readable formatting

**ZIP Export:**
- [ ] All formats included
- [ ] Folder structure logical
- [ ] JSZip library (jszip@3.10.1) used correctly
- [ ] Single downloadable file

---

## PART 8: GHOST CODE &amp; DEAD CODE DETECTION

### 8.1 Unused Functions

Search for functions that are:
- [ ] Defined but never called
- [ ] Called but with commented-out callers
- [ ] Exported but never imported
- [ ] Event handlers for removed UI elements

### 8.2 Unused Variables

Search for variables that are:
- [ ] Declared but never read
- [ ] Assigned but never used
- [ ] Parameters that are ignored

### 8.3 Unreachable Code

Search for code that:
- [ ] Follows unconditional `return` statements
- [ ] Is inside always-false conditions
- [ ] Is in catch blocks for impossible errors

### 8.4 Commented-Out Code

Identify and evaluate:
- [ ] Large blocks of commented code
- [ ] TODO comments indicating incomplete work
- [ ] FIXME comments indicating known bugs
- [ ] HACK comments indicating technical debt

### 8.5 Console Logs

Identify:
- [ ] Development console.log statements that should be removed
- [ ] console.error statements that might expose sensitive info
- [ ] console.warn statements for deprecated usage

---

## PART 9: SECURITY CONSIDERATIONS

### 9.1 Credential Exposure

Check for:
- [ ] Hardcoded passwords in JS files
- [ ] Supabase keys in client-side code (acceptable for anon key only)
- [ ] API keys or secrets in source

### 9.2 Input Sanitization

Verify:
- [ ] User input is sanitized before display (XSS prevention)
- [ ] User input is parameterized in database queries
- [ ] File names are sanitized for exports

### 9.3 Role Verification

Verify:
- [ ] Role is checked on every sensitive operation
- [ ] Role cannot be easily spoofed via sessionStorage manipulation
- [ ] Backend validates role (if applicable via RLS)

---

## PART 10: SPECIFIC ISSUES TO INVESTIGATE

Based on the specification, investigate these potential problem areas:

### 10.1 Green Team &amp; Red Team

Per spec, these are "Currently inactive" and "Full role implementations" are planned. Check:
- [ ] Are there partial implementations that could cause errors?
- [ ] Are there hardcoded "blue" team assumptions that would break multi-team?
- [ ] Are database queries properly filtering by team?

### 10.2 Research Tables Usage

The following tables are marked as "(RESEARCH)" in the schema. Verify they are actually being used:
- [ ] `participants` - Is it populated on login?
- [ ] `session_participants` - Is it tracking sessions?
- [ ] `game_state_transitions` - Is it logging transitions?
- [ ] `participant_activity` - Is it logging events?
- [ ] `data_completeness_checks` - Is it being used?
- [ ] `action_relationships` - Is it linking actions?
- [ ] `rfi_action_links` - Is it linking RFIs to actions?

### 10.3 Timer Synchronization

The spec mentions timer is stored in localStorage but controlled by White Cell. Verify:
- [ ] White Cell can start/pause/reset
- [ ] All other roles can only view
- [ ] Timer survives page refresh correctly
- [ ] Cross-tab synchronization works

### 10.4 Move Completion Flow

Verify the move completion workflow:
- [ ] Notetaker can submit move completion
- [ ] `move_completions` table is populated
- [ ] `final_action_count` and `final_timeline_count` are accurate
- [ ] White Cell can advance move after completion

---

## OUTPUT FORMAT

For each issue found, document as follows:

```markdown
### Issue #[NUMBER]: [TITLE]

**Severity:** CRITICAL | HIGH | MEDIUM | LOW
**Category:** Inconsistency | Gap | Ghost Code | Dead Code | Bug | Security
**Location:** [file:line or file:function]

**Description:**
[Detailed description of the issue]

**Expected Behavior:**
[What should happen according to spec/schema]

**Actual Behavior:**
[What the code actually does or doesn't do]

**Evidence:**
[Code snippets, schema references, spec quotes]

**Recommended Fix:**
[Specific code changes or approach to resolve]
```

---

## FINAL CHECKLIST

Before completing the review, ensure:

- [ ] All 17 database tables have been audited against code
- [ ] All 4 role implementations have been verified
- [ ] All real-time subscriptions have been tested
- [ ] All export functions have been verified
- [ ] All error handling paths have been checked
- [ ] All deprecated file usage has been identified
- [ ] All ghost/dead code has been catalogued
- [ ] All security concerns have been noted
- [ ] All UI/UX inconsistencies have been documented
- [ ] Cross-file references have been validated

---

*This prompt version: 1.0*  
*Based on: PROJECT_SPECIFICATION.md v1.1 and COMPLETE_SCHEMA.sql*
