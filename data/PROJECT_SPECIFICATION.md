# ESG-Demo Economic Statecraft Simulation Platform
## Project Specification Document

**Version:** 1.1  
**Last Updated:** December 2024  
**Status:** Beta (Demo V.1.1)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Overview](#project-overview)
3. [System Architecture](#system-architecture)
4. [User Roles & Permissions](#user-roles--permissions)
5. [Core Features](#core-features)
6. [Game Structure](#game-structure)
7. [Data Models](#data-models)
8. [User Interfaces](#user-interfaces)
9. [Technical Specifications](#technical-specifications)
10. [Data Flow & Synchronization](#data-flow--synchronization)
11. [Export & Reporting](#export--reporting)
12. [Integration Points](#integration-points)
13. [Error Handling & Edge Cases](#error-handling--edge-cases)
14. [Future Enhancements](#future-enhancements)

---

## Executive Summary

The ESG-Demo Economic Statecraft Simulation Platform is a **multi-role, real-time wargaming application** designed to simulate economic competition scenarios. The platform enables teams to make strategic decisions, submit actions, request information, and receive adjudicated outcomes in a structured, time-bound simulation environment.

### Key Characteristics

- **Real-time Collaboration:** Multiple users can participate simultaneously in the same simulation session
- **Role-Based Access:** Different interfaces for Game Master, Facilitators, Notetakers, and White Cell operators
- **Multi-Move Structure:** Simulations consist of 3 moves, each spanning different time epochs (2027-2034)
- **Phase-Based Progression:** Each move contains 5 distinct phases with specific objectives
- **Data Persistence:** Supabase backend with localStorage fallback for offline capability
- **Comprehensive Export:** Multiple export formats (JSON, CSV, XLSX, PDF, ZIP) for analysis

---

## Project Overview

### Purpose

The platform simulates economic statecraft scenarios where teams (Blue, Green, Red) make strategic decisions about economic tools (sanctions, export controls, trade policies, etc.) to achieve geopolitical objectives. The simulation tracks:

- Strategic actions and their outcomes
- Information requests (RFIs) and responses
- Team dynamics and decision-making processes
- Adjudicated results of actions
- Timeline of all events

### Target Users

1. **Game Masters:** Administrators who create sessions, monitor progress, and export data
2. **Team Facilitators:** Team leaders who submit strategic actions and information requests
3. **Team Notetakers:** Observers who document team dynamics, observations, and external factors
4. **White Cell Operators:** Neutral adjudicators who respond to RFIs and evaluate actions

### Use Cases

- **Training Exercises:** Military and policy training scenarios
- **Research:** Academic research on decision-making processes
- **Analysis:** Post-exercise analysis of team behavior and outcomes
- **Wargaming:** Structured wargaming exercises with multiple teams

---

## System Architecture

### Technology Stack

**Frontend:**
- Vanilla JavaScript (ES6+)
- HTML5
- CSS3 (Custom styling with simulation theme)
- No framework dependencies (pure client-side)

**Backend:**
- Supabase (PostgreSQL database)
- Real-time subscriptions via Supabase Realtime
- RESTful API for CRUD operations

**Storage:**
- Primary: Supabase PostgreSQL database
- Fallback: Browser localStorage
- Auto-save: File System Access API (with download fallback)

**Data Layer:**
- `data-layer.js` - Unified data layer combining Supabase operations and localStorage utilities
- Provides `window.esg` API for all database operations
- Includes migration, backup, validation, and error handling
- **Note:** This is the primary utility file; `util.js` and `utils.js` are deprecated

**External Libraries:**
- Supabase JS Client (`@supabase/supabase-js@2`)
- XLSX (`xlsx@0.18.5`) for Excel export
- JSZip (`jszip@3.10.1`) for ZIP bundling
- jsPDF (`jspdf@2.5.1`) for PDF generation

### File Structure

```
ESG-demo/
├── index.html                 # Landing page with team selection
├── master.html                # Game Master control panel
├── teams/
│   └── blue/
│       ├── blue_facilitator.html
│       ├── blue_notetaker.html
│       └── blue_white_cell.html
├── js/
│   ├── app.js                 # Main application entry
│   ├── gamemaster.js          # Game Master logic
│   ├── facilitator.js         # Blue Team Facilitator logic
│   ├── notetaker.js           # Blue Team Notetaker logic
│   ├── whitecell.js           # White Cell logic
│   ├── data-layer.js          # ⭐ Unified data layer (Supabase + localStorage + utilities)
│   ├── research-tracking.js   # 🆕 Research participant tracking and heartbeat system
│   ├── role-dialogs.js        # 🆕 Role takeover and availability dialogs
│   ├── util.js                # ⚠️ DEPRECATED - Use data-layer.js instead
│   ├── utils.js               # ⚠️ DEPRECATED - Use data-layer.js instead
│   ├── autoSave.js            # Auto-save functionality
│   ├── loading.js             # Loading indicators
│   └── modal-utils.js         # Modal dialogs
├── styles/
│   ├── main.css               # Base styles
│   ├── simulation-theme.css   # Theme variables
│   ├── master.css             # Game Master styles
│   ├── blue_facilitator.css
│   ├── blue_notetaker.css
│   └── blue_whitecell.css
├── data_schema/
│   ├── Facilitator Schema.json
│   ├── Notetaker Schema.json
│   └── White Cell Schema.json
└── img/                       # Images and icons
```

### Architecture Patterns

1. **Client-Side State Management:** Each role maintains local state synchronized via Supabase
2. **Event-Driven Updates:** Real-time subscriptions push updates to all connected clients
3. **Fallback Strategy:** localStorage used when Supabase unavailable
4. **Session Isolation:** All data scoped to session IDs to prevent cross-contamination

---

## User Roles & Permissions

### 1. Game Master

**Access Level:** Full administrative control

**Capabilities:**
- Create, manage, and delete simulation sessions
- View all team activities in real-time dashboard
- Monitor metrics (actions, RFIs, observations)
- Control global timer (start, pause, reset)
- Advance moves (1→2→3) and phases (1→2→3→4→5)
- Review and adjudicate actions (optional, typically White Cell)
- Respond to RFIs (optional, typically White Cell)
- Export data in multiple formats
- Archive sessions before reset
- Hard reset simulation (with confirmation)

**Authentication:**
- Role: `white` or `admin2025`
- Password: `admin2025`

**Interface Sections:**
- Live Dashboard
- Master Timeline
- Review Actions
- RFI Management
- Session Control
- User Management
- Game Control

### 2. Blue Team Facilitator

**Access Level:** Team decision-maker

**Capabilities:**
- Submit strategic actions (mechanism, sector, targets, goals)
- Create information requests (RFIs) with priority levels
- Record observations
- View session timeline
- View White Cell responses to RFIs
- Edit/delete draft actions before submission
- Submit actions to White Cell for adjudication

**Authentication:**
- Role: `blue_facilitator`
- Password: `facilitator2025`

**Interface Sections:**
- Info Requests (RFI management)
- Actions (strategic action submission)
- Observations (quick capture)
- Timeline (session history)
- White Responses (RFI responses)

**Restrictions:**
- Cannot change move (controlled by White Cell)
- Cannot control timer (read-only display)
- Cannot access other teams' data

### 3. Blue Team Notetaker

**Access Level:** Observer and analyst

**Capabilities:**
- Quick capture of observations (NOTE, MOMENT, QUOTE types)
- Analyze team dynamics (leadership, friction metrics, resource strategy)
- Track alliance engagement and feedback
- Log external factors (adversary activity, counter-measures)
- View timeline of all captured items
- Export notes data

**Authentication:**
- Role: `blue_notetaker`
- Password: `notetaker2025`

**Interface Sections:**
- Capture (quick observation entry)
- Timeline (chronological event log)
- Dynamics (team analysis)
- Actions (view submitted actions)
- Alliance (external factors tracking)

**Restrictions:**
- Read-only access to actions (cannot submit)
- Cannot change move or phase
- Cannot control timer

### 4. Blue Team White Cell

**Access Level:** Adjudicator and coordinator

**Capabilities:**
- Control move progression (1→2→3)
- Control phase progression (1→2→3→4→5)
- Control global timer (start, pause, reset)
- View multi-team timeline
- Review submitted actions from Facilitator
- Adjudicate actions (vulnerabilities, interdependencies, outcomes)
- Respond to RFIs from Facilitator
- Send communications to teams
- Quick capture of observations

**Authentication:**
- Role: `blue_whitecell`
- Password: `whitecell2025`

**Interface Sections:**
- Timeline (all team activities)
- Capture (quick observations)
- Requests (RFI management)
- Actions (review and adjudicate)
- Adjudication (outcome determination)
- Communication (team messaging)

**Special Responsibilities:**
- Source of truth for game state (move, phase)
- Broadcasts state changes to all connected clients
- Manages timer synchronization

### Role Slot Management

**Purpose:** Prevent multiple users from logging into the same role simultaneously and ensure research data integrity

**Role Limits:**
- **Blue Facilitator:** 1 participant maximum
- **Blue White Cell:** 1 participant maximum
- **Blue Notetaker:** 2 participants maximum
- **Game Master:** 1 participant maximum
- **Viewer:** Unlimited participants

**Enforcement:**
- Role availability checked before login
- Active participants tracked via heartbeat system
- Stale connections (>2 minutes no heartbeat) automatically freed
- Takeover option available when role is full

**Participant Tracking:**
- All logins recorded in `session_participants` table
- Client ID persists across page refreshes (sessionStorage)
- Connection duration tracked for research purposes
- Automatic disconnection on page close
- Heartbeat updates every 30 seconds

**Heartbeat System:**
- Heartbeat sent every 30 seconds to update `heartbeat_at` timestamp
- Connections without heartbeat for >2 minutes marked inactive
- Inactive connections automatically free up role slots
- Research data includes connection duration and activity patterns
- Automatic cleanup on browser tab close

**Takeover Functionality:**
- When role is full, user sees takeover dialog
- Dialog shows currently active participants
- User can cancel or request takeover
- Takeover disconnects existing participant and allows new login
- All takeover events logged for audit purposes

**Offline Behavior:**
- Role limits NOT enforced when Supabase unavailable
- Warning logged to console
- Login allowed to prevent blocking users
- Research tracking unavailable in offline mode

---

## Core Features

### 1. Session Management

**Session Creation:**
- Game Master creates session with unique ID
- Session name and metadata stored in Supabase
- Session ID shared with participants for joining

**Session Joining:**
- Participants enter session ID to join
- Session ID stored in `sessionStorage`
- Real-time connection established to Supabase
- **Participant registered in `session_participants` table**
- **Role slot availability verified before join**
- **Heartbeat system initiated on successful join**
- **Connection tracked for research purposes**
- **Automatic disconnection on page close or timeout**

**Session Isolation:**
- All data filtered by `session_id`
- Participants only see data from their session
- No cross-session data leakage

**Session Lifecycle:**
- Active: Participants can join and interact
- Archived: Data preserved, no new interactions
- Deleted: All data removed (with confirmation)

### 2. Strategic Action Submission

**Action Components:**
- **Mechanism:** Economic tool (sanctions, export controls, investment, trade, financial, economic, industrial, infrastructure)
- **Sector:** Target sector (biotechnology, agriculture, telecommunications, semiconductors, energy, finance)
- **Exposure Type:** Risk category (Supply Chain, Cyber, Financial, Industrial, Trade)
- **Targets:** Array of target entities (PRC, RUS, EU-GER, etc.)
- **Goal Text:** Narrative description of objective
- **Expected Outcomes:** Anticipated results
- **Ally Contingencies:** Dependencies on allies

**Action Workflow:**
1. Facilitator creates action draft
2. Action saved to localStorage (draft state)
3. Facilitator can edit/delete draft
4. Facilitator submits to White Cell
5. Action status changes to "SUBMITTED"
6. White Cell reviews and adjudicates
7. Adjudication result returned to Facilitator

**Action States:**
- `DRAFT`: In progress, not submitted
- `SUBMITTED`: Sent to White Cell for review
- `ADJUDICATED`: White Cell has determined outcome
- `ABANDONED`: Deleted/withdrawn

### 3. Information Requests (RFIs)

**RFI Components:**
- **Priority:** NORMAL, HIGH, or URGENT
- **Categories:** Economic Data, Trade Data, Alliance Status, Tech Assessment
- **Query Text:** The information request
- **Timestamp:** When requested

**RFI Workflow:**
1. Facilitator creates RFI
2. RFI appears in White Cell's request queue
3. White Cell responds with information
4. Response appears in Facilitator's "White Responses" section
5. RFI status updates to "ANSWERED"

**RFI States:**
- `PENDING`: Awaiting response
- `ANSWERED`: White Cell has responded
- `WITHDRAWN`: Cancelled by Facilitator

### 4. Observations & Timeline

**Observation Types:**
- **NOTE:** General observation
- **MOMENT:** Significant event or decision point
- **QUOTE:** Direct quote from participant

**Timeline Features:**
- Chronological display of all events
- Filterable by team, type, phase
- Real-time updates via Supabase subscriptions
- Cross-team visibility (White Cell sees all teams)

**Timeline Events:**
- Action submissions
- RFI submissions and responses
- Phase transitions
- Move transitions
- Adjudications
- Communications

### 5. Team Dynamics Analysis

**Metrics Tracked:**
- **Leadership:** Primary faction (Executive, Legislative, VC), decision style (Consensus, Vote, Dictated)
- **Friction Metrics:** Debate intensity (1-10), deliberation vs execution (1-10), coalition impact (1-10)
- **Resource Strategy:** Posture (Conserving vs Deploying), rationale

**Use Cases:**
- Track decision-making patterns across moves
- Identify stress points in team dynamics
- Analyze alliance health over time
- Export for post-exercise analysis

### 6. Adjudication System

**Adjudication Components:**
- **Vulnerabilities:** Selected from predefined list
- **Interdependencies:** Structured impact tracking
- **Structural Impacts:** Technological edge, industrial base, supply chain resilience, alliance coordination
- **Outcome:** Success, Partial Success, Fail, Backfire
- **Narrative:** Detailed explanation of outcome

**Adjudication Workflow:**
1. White Cell selects action to adjudicate
2. White Cell fills adjudication form
3. Adjudication saved to database
4. Action status updates to "ADJUDICATED"
5. Result visible to Facilitator and Game Master

### 7. Timer Management

**Timer Features:**
- Global timer synchronized across all clients
- Default duration: 90 minutes (configurable)
- Start, pause, reset controls (White Cell only)
- Visual warnings when time is low (5 min, 1 min)
- Timer state persists across page refreshes
- Elapsed time calculation on resume

**Timer Synchronization:**
- White Cell controls timer
- Timer state stored in shared localStorage key
- All clients read and display timer
- Real-time updates via storage events

### 8. Move & Phase Management

**Move Structure:**
- **Move 1:** Epoch 1 (2027-2030)
- **Move 2:** Epoch 2 (2030-2032)
- **Move 3:** Epoch 3 (2032-2034)

**Phase Structure (per move):**
- **Phase 1:** Internal Deliberation (30-40 min)
- **Phase 2:** Alliance Consultation (20-30 min)
- **Phase 3:** Finalization (10-15 min)
- **Phase 4:** Adjudication (15-20 min)
- **Phase 5:** Results Brief (10-15 min)

**Control:**
- White Cell controls move and phase progression
- Changes broadcast to all connected clients
- Phase guidance updates automatically
- Move transitions trigger data loading

### 9. Role Login Enhancement

**Purpose:** Ensure data integrity and research validity by preventing multi-login and enforcing role slot limits

**Components:**

**1. Role Availability Checking:**
- Pre-login verification of role slot availability
- Real-time query of active participants from `session_participants` table
- Heartbeat timeout detection (2-minute threshold)
- Counts only active participants with recent heartbeat
- Fail-open approach when Supabase unavailable (allows login)

**2. Takeover Dialog (`role-dialogs.js`):**
- Displayed when role is full
- Shows list of currently active participants
- User can cancel or request takeover
- Takeover disconnects existing participant(s)
- Confirmation required before disconnection

**3. Participant Registration:**
- Creates/updates entry in `participants` table
- Creates entry in `session_participants` table
- Tracks join time, role, session association
- Links to research tracking system
- Records client ID for attribution

**4. Heartbeat System (`research-tracking.js`):**
- Automatic heartbeat every 30 seconds
- Updates `heartbeat_at` and `last_seen` timestamps
- Enables detection of stale connections
- Automatic cleanup on page close via `beforeunload` event
- Marks participant as `is_active = false` on disconnect

**5. Research Integration:**
- All logins tracked for research analysis
- Connection duration calculated from timestamps
- Participant attribution always available
- Contribution counts tracked per participant
- Supports post-exercise analysis

**Login Workflow:**
1. User enters session ID/name and password
2. System validates password against `ROLES` object
3. System checks role availability via `checkRoleAvailability()`
4. If role full → Show takeover dialog via `showRoleTakeoverDialog()`
5. If user confirms takeover → Call `disconnectExistingParticipants()`
6. Register participant via `registerSessionParticipant()`
7. Start heartbeat via `startParticipantHeartbeat()`
8. Complete login and reload page

**Offline Behavior:**
- Role limits NOT enforced when Supabase unavailable
- Warning logged to console: "Supabase unavailable, role limits not enforced"
- Login allowed to prevent blocking users
- Research data will be incomplete
- Heartbeat system inactive

**Database Tables:**
- `participants` - Stores participant metadata and client IDs
- `session_participants` - Tracks active sessions, roles, and heartbeats
- Indexes on `(session_id, role, is_active)` for performance
- Index on `heartbeat_at` for timeout detection

---

## Game Structure

### Simulation Flow

```
┌─────────────────────────────────────────────────────────┐
│                    MOVE 1 (2027-2030)                    │
├─────────────────────────────────────────────────────────┤
│ Phase 1: Internal Deliberation                          │
│   - Teams discuss internally                             │
│   - Notetaker captures dynamics                         │
│   - Facilitator drafts actions                          │
├─────────────────────────────────────────────────────────┤
│ Phase 2: Alliance Consultation                         │
│   - Teams consult with allies                           │
│   - RFIs submitted to White Cell                        │
│   - White Cell responds                                 │
├─────────────────────────────────────────────────────────┤
│ Phase 3: Finalization                                   │
│   - Facilitator submits final actions                   │
│   - Actions sent to White Cell                         │
├─────────────────────────────────────────────────────────┤
│ Phase 4: Adjudication                                   │
│   - White Cell adjudicates actions                     │
│   - Outcomes determined                                │
├─────────────────────────────────────────────────────────┤
│ Phase 5: Results Brief                                 │
│   - Outcomes delivered                                 │
│   - Teams react and adjust                             │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│                    MOVE 2 (2030-2032)                    │
│              (Same phase structure)                       │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│                    MOVE 3 (2032-2034)                    │
│              (Same phase structure)                       │
└─────────────────────────────────────────────────────────┘
```

### Phase Guidance

Each phase has specific guidance displayed to users:

**Phase 1 - Internal Deliberation:**
- Teams focus on internal discussions
- Notetaker observes decision-making
- Facilitator prepares action drafts

**Phase 2 - Alliance Consultation:**
- Teams reach out to allies
- RFIs submitted for information
- White Cell provides responses

**Phase 3 - Finalization:**
- Final action decisions made
- Actions submitted to White Cell
- No further edits allowed

**Phase 4 - Adjudication:**
- White Cell evaluates actions
- Outcomes determined
- Results prepared

**Phase 5 - Results Brief:**
- Outcomes delivered to teams
- Teams react and plan next move
- Lessons captured

---

## Data Models

### Strategic Action

```json
{
  "id": "act_1715201",
  "sequence_num": 1,
  "timestamp_submitted": "10:15:22",
  "mechanism": "Sanctions",
  "sector": "Semiconductors",
  "exposure_type": "Supply Chain",
  "targets": ["PRC", "RUS", "EU-GER"],
  "goal_text": "Degrade PRC ability to manufacture <7nm chips.",
  "expected_outcomes": "30% reduction in output within 12 months.",
  "ally_contingencies": "Requires EU alignment to prevent backfilling.",
  "status": "SUBMITTED",
  "move": 1,
  "phase": 3,
  "team": "blue",
  "session_id": "session_123",
  "created_at": "2024-01-15T10:15:22Z"
}
```

### Information Request (RFI)

```json
{
  "id": "req_8821",
  "priority": "URGENT",
  "timestamp": "10:05:00",
  "categories": ["Economic Data", "Alliance Status"],
  "query_text": "What is the German Chancellor's stance on the new tariff proposal?",
  "status": "ANSWERED",
  "move": 1,
  "phase": 2,
  "team": "blue",
  "session_id": "session_123",
  "created_at": "2024-01-15T10:05:00Z",
  "response": {
    "content": "The German Chancellor is cautiously supportive...",
    "responded_at": "2024-01-15T10:20:00Z",
    "responded_by": "white_cell"
  }
}
```

### Observation

```json
{
  "id": "obs_991",
  "timestamp": "10:12:00",
  "phase": 1,
  "type": "MOMENT",
  "author_faction": "Legislative",
  "content": "Argument broke out regarding the cost of subsidies.",
  "move": 1,
  "team": "blue",
  "session_id": "session_123"
}
```

### Team Dynamics

```json
{
  "move_id": 1,
  "leadership": {
    "primary_faction": "Executive",
    "decision_style": "Consensus",
    "notes": "VP lead the discussion, overruling the legislative rep."
  },
  "friction_metrics": {
    "debate_intensity": 7,
    "deliberation_vs_execution": 4,
    "coalition_impact": 6
  },
  "resource_strategy": {
    "posture": "Conserving",
    "rationale": "Saving political capital for Move 2."
  }
}
```

### Adjudication

```json
{
  "action_id": "act_1715201",
  "vulnerabilities": ["Supply Chain Disruption", "Alliance Fragmentation"],
  "interdependencies": {
    "economic": "High dependency on EU cooperation",
    "technological": "Requires semiconductor expertise"
  },
  "structural_impacts": {
    "technological_edge": "Moderate gain",
    "industrial_base": "Minimal impact",
    "supply_chain_resilience": "Degraded",
    "alliance_coordination": "Improved"
  },
  "outcome": "PARTIAL_SUCCESS",
  "narrative": "The sanctions achieved partial success but strained EU relations...",
  "adjudicated_at": "2024-01-15T11:00:00Z",
  "adjudicated_by": "white_cell"
}
```

### Game State

```json
{
  "session_id": "session_123",
  "move": 1,
  "phase": 3,
  "timer": {
    "seconds": 3600,
    "running": true,
    "lastUpdate": 1705312800000
  },
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

## User Interfaces

### Landing Page (`index.html`)

**Purpose:** Team and role selection

**Components:**
- Team selection cards (Blue, Green, Red)
- Role links (Facilitator, Notetaker, White Cell)
- Game Master control panel link
- Loading spinner
- Classification banner

**Navigation:**
- Click role link → Navigate to role-specific interface
- Click "Open Control Panel" → Navigate to Game Master

### Game Master Interface (`master.html`)

**Layout:**
- Sidebar navigation with sections
- Main content area with section views
- Global timer display
- Move/phase indicators

**Sections:**

1. **Live Dashboard**
   - Real-time metrics (actions, notes, phase)
   - Recent activity feed
   - Empty states when no data

2. **Master Timeline**
   - Aggregated timeline from all teams
   - Filterable by team, type, move
   - Real-time updates

3. **Review Actions**
   - List of all submitted actions
   - Action details and status
   - Adjudication results

4. **RFI Management**
   - List of all information requests
   - Response interface
   - Status tracking

5. **Session Control**
   - Create new session
   - Select existing session
   - Delete session (with confirmation)
   - Participant list

6. **User Management**
   - Add/remove participants
   - Role assignments
   - Access control

7. **Game Control**
   - Move/phase controls
   - Timer controls
   - Export functions
   - Archive/Reset options

### Blue Team Facilitator Interface (`blue_facilitator.html`)

**Layout:**
- Header with move/phase display
- Sidebar navigation
- Main content area
- Session status indicator

**Sections:**

1. **Info Requests**
   - Create new RFI form
   - List of pending requests
   - Status indicators
   - Withdraw functionality

2. **Actions**
   - Create action form
   - List of actions (draft and submitted)
   - Edit/delete draft actions
   - Submit to White Cell button
   - Action counter badge

3. **Observations**
   - Quick capture form
   - Observation list
   - Type filtering

4. **Timeline**
   - Session timeline
   - Filterable by type
   - Real-time updates

5. **White Responses**
   - RFI responses from White Cell
   - Threaded display
   - Timestamp tracking

### Blue Team Notetaker Interface (`blue_notetaker.html`)

**Layout:**
- Header with move/phase display
- Sidebar navigation
- Main content area
- Session status indicator

**Sections:**

1. **Capture**
   - Quick observation entry
   - Type selector (NOTE, MOMENT, QUOTE)
   - Faction tagging
   - Real-time timeline preview

2. **Timeline**
   - Chronological event log
   - Filterable by type, phase
   - Export functionality

3. **Dynamics**
   - Leadership analysis form
   - Friction metrics (sliders 1-10)
   - Resource strategy selection
   - Notes fields

4. **Actions**
   - View submitted actions (read-only)
   - Action details
   - Status tracking

5. **Alliance**
   - Alliance feedback summary
   - Blue reaction to allies
   - Red activity assessment
   - Counter-measures tracking
   - Impact assessments

### Blue Team White Cell Interface (`blue_white_cell.html`)

**Layout:**
- Header with move/phase controls
- Sidebar navigation
- Main content area
- Timer controls
- Session status indicator

**Sections:**

1. **Timeline**
   - Multi-team timeline
   - Filterable by team, type
   - Real-time updates
   - Badge counter

2. **Capture**
   - Quick observation entry
   - Type selector
   - Team tagging

3. **Requests**
   - List of pending RFIs
   - Response interface
   - Status management
   - Badge counter

4. **Actions**
   - List of submitted actions
   - Action details
   - Adjudication trigger
   - Badge counter

5. **Adjudication**
   - Action selector
   - Adjudication form
   - Vulnerability checkboxes
   - Interdependency fields
   - Structural impact inputs
   - Outcome selector
   - Narrative textarea
   - Submit button

6. **Communication**
   - Communication log
   - Send message interface
   - Team targeting
   - Message threading

---

## Technical Specifications

### Authentication System

**Role-Based Authentication:**
- Password-based authentication
- Roles stored in `sessionStorage`
- Session ID required for database access
- Role verification on page load

**Role Passwords:**
```javascript
{
  'white': 'admin2025',
  'blue_facilitator': 'facilitator2025',
  'blue_notetaker': 'notetaker2025',
  'blue_whitecell': 'whitecell2025',
  'red': 'red_team',
  'green': 'green_team',
  'viewer': 'observer'
}
```

**Session Management:**
- Session ID stored in `sessionStorage` as `esg_session_id`
- Client ID generated on first load, stored in `sessionStorage` as `esg_client_id`
- Role stored in `sessionStorage` as `esg_role`

### Data Storage

**Primary Storage (Supabase):**
- PostgreSQL database
- Tables: `sessions`, `actions`, `requests`, `communications`, `timeline`, `game_state`, `action_logs`
- Real-time subscriptions via Supabase Realtime
- Row-level security (RLS) policies (should be configured)

**Fallback Storage (localStorage):**
- Browser localStorage for offline capability
- Key naming convention: `esg:move:{move}:{role}`
- Shared state key: `esg:sharedState`
- Shared timer key: `esg:sharedTimer`

**Auto-Save:**
- File System Access API (when available)
- Fallback to automatic downloads
- Saves to `data_storage/` folder structure
- Periodic saves (every 30 seconds)
- Final save on `beforeunload` event

### Real-Time Synchronization

**Supabase Subscriptions:**
- Game state changes
- Action submissions/updates
- RFI submissions/responses
- Timeline events
- Communications

**Subscription Channels:**
- `game_state:{session_id}`
- `actions:{session_id}`
- `requests:{session_id}`
- `timeline:{session_id}`
- `comms:{session_id}`

**localStorage Synchronization:**
- Storage events for cross-tab updates
- Shared keys for game state and timer
- Polling fallback when storage events unavailable

### State Management

**Game State:**
- Move number (1-3)
- Phase number (1-5)
- Timer state (seconds, running, lastUpdate)
- Stored in Supabase `game_state` table
- Synchronized via real-time subscriptions
- Fallback to localStorage

**Local State:**
- Each role maintains local arrays (actions, requests, observations)
- Synced with database on load
- Updated via real-time subscriptions
- Saved to localStorage as backup

### Error Handling

**Connection Errors:**
- Supabase connection failures fall back to localStorage
- User notified of offline mode
- Data queued for sync when connection restored

**Validation Errors:**
- Form validation before submission
- Enum validation for dropdowns
- Required field checks
- User-friendly error messages

**Storage Errors:**
- QuotaExceededError handling
- Graceful degradation
- User notification

---

## Data Flow & Synchronization

### Action Submission Flow

```
Facilitator creates action
    ↓
Saved to localStorage (draft)
    ↓
Facilitator submits
    ↓
POST to Supabase actions table
    ↓
Real-time subscription broadcasts to:
    - White Cell (for review)
    - Game Master (for dashboard)
    - Facilitator (confirmation)
    ↓
Action appears in all interfaces
```

### RFI Flow

```
Facilitator creates RFI
    ↓
POST to Supabase requests table
    ↓
Real-time subscription broadcasts to:
    - White Cell (for response)
    - Game Master (for tracking)
    ↓
White Cell responds
    ↓
POST to Supabase communications table
    ↓
Update request status to "ANSWERED"
    ↓
Real-time subscription broadcasts to:
    - Facilitator (response visible)
    - Game Master (status update)
```

### Game State Flow

```
White Cell changes move/phase
    ↓
POST to Supabase game_state table
    ↓
Real-time subscription broadcasts to all clients
    ↓
All clients update:
    - Move selector
    - Phase buttons
    - Phase guidance
    - Data reload for new move
```

### Timer Flow

```
White Cell starts timer
    ↓
Timer state saved to localStorage (shared key)
    ↓
Storage event fires
    ↓
All clients update timer display
    ↓
Timer interval updates every second
    ↓
State persisted to localStorage
```

---

## Export & Reporting

### Export Formats

**1. Full Archive (JSON)**
- Complete data structure
- All moves, all roles
- Schema-compliant format
- Suitable for analysis and backup

**2. Tabular Data (CSV/XLSX)**
- Spreadsheet format
- Separate sheets for:
  - Actions
  - RFIs
  - Observations
  - Timeline
  - Dynamics
- Suitable for Excel analysis

**3. PDF Summary**
- Formatted report
- Tables and summaries
- Suitable for printing and sharing

**4. ZIP Bundle**
- All formats combined
- Organized folder structure
- Single download

### Export Data Structure

**Archive Format:**
```json
{
  "export_metadata": {
    "timestamp": "2024-01-15T12:00:00Z",
    "session_id": "session_123",
    "session_name": "Exercise Alpha"
  },
  "moves": [
    {
      "move_id": 1,
      "epoch": "2027-2030",
      "facilitator_data": { ... },
      "notetaker_data": { ... },
      "white_cell_data": { ... }
    }
  ],
  "shared_state": { ... },
  "shared_timer": { ... }
}
```

### Export Functions

**Location:** `js/gamemaster.js`

**Functions:**
- `exportFullArchive()` - JSON export
- `exportTabularData()` - CSV/XLSX export
- `exportPdfSummary()` - PDF export
- `exportZipBundle()` - Combined export

**Data Gathering:**
- `gatherSimulationData()` - Collects all data from localStorage/Supabase
- Iterates through moves 1-3
- Aggregates all role data
- Builds flat tables for spreadsheet export

---

## Integration Points

### Supabase Integration

**Connection:**
- URL: `https://holpoyfxbhnzwsnkcnua.supabase.co`
- Anon key: (stored in `js/data-layer.js`)
- Client initialization in `js/data-layer.js`
- **Note:** `data-layer.js` is the unified data layer that replaces both `util.js` and `utils.js`

**Tables Used:**
- `sessions` - Session metadata
- `participants` - **Participant metadata and client IDs**
- `session_participants` - **Active session participation tracking with heartbeats**
- `actions` - Strategic actions
- `requests` - Information requests
- `communications` - RFI responses and messages
- `timeline` - Timeline events
- `game_state` - Global game state
- `action_logs` - Audit trail for actions

**Operations:**
- CREATE: Session creation, action submission, RFI creation
- READ: Fetch actions, requests, timeline, game state
- UPDATE: Action updates, request status, game state
- DELETE: Soft deletes (is_deleted flag)

### Browser APIs

**File System Access API:**
- Auto-save functionality
- Direct file writing (when supported)
- Fallback to downloads

**localStorage API:**
- Primary fallback storage
- Cross-tab synchronization
- Session persistence

**SessionStorage API:**
- Session ID storage (`esg_session_id`)
- Role storage (`esg_role`)
- Client ID storage (`esg_client_id`) - **Persistent across page refreshes**
- Used for participant tracking and research attribution
- Client ID generated once per browser session
- Enables multi-login prevention and participant tracking

---

## Error Handling & Edge Cases

### Connection Failures

**Scenario:** Supabase unavailable

**Handling:**
1. Detect connection failure
2. Switch to localStorage mode
3. Display offline indicator
4. Queue operations for sync
5. Attempt reconnection periodically

### Storage Quota Exceeded

**Scenario:** localStorage full

**Handling:**
1. Catch QuotaExceededError
2. Notify user
3. Suggest clearing old data
4. Offer export before clearing

### Concurrent Edits

**Scenario:** Multiple users edit same action

**Handling:**
1. Last-write-wins (Supabase handles)
2. Real-time updates notify all clients
3. Conflict resolution via timestamps

### Page Refresh During Timer

**Scenario:** User refreshes page while timer running

**Handling:**
1. Load timer state from localStorage
2. Calculate elapsed time
3. Resume timer with corrected time
4. Cap maximum elapsed time (24 hours)

### Session Expiry

**Scenario:** Session deleted while user active

**Handling:**
1. Detect session not found
2. Prompt user to join new session
3. Clear local data
4. Redirect to session join

### Role Slot Full

**Scenario:** User attempts to login when role is at capacity

**Handling:**
1. Display takeover dialog via `showRoleTakeoverDialog()`
2. Show currently active participants with names
3. Offer cancel or takeover options
4. If takeover → Call `disconnectExistingParticipants()` and allow login
5. If cancel → Return to login screen
6. Log event for audit purposes

### Heartbeat Timeout

**Scenario:** User loses connection for >2 minutes

**Handling:**
1. Heartbeat system detects timeout (no update to `heartbeat_at`)
2. Participant marked as `is_active = false` in database
3. Role slot becomes available to other users
4. User must re-login if they return
5. Connection duration recorded for research analysis
6. Disconnection logged with timestamp

### Multi-Tab Login Attempt

**Scenario:** Same user opens multiple tabs with same role

**Handling:**
1. First tab establishes connection and starts heartbeat
2. Second tab checks role availability
3. Detects role is full (first tab is active)
4. Takeover dialog shows first tab as active participant
5. User can takeover (disconnects first tab) or cancel (keeps first tab active)
6. Only one tab remains active per role

### Offline Mode Role Login

**Scenario:** User attempts login when Supabase unavailable

**Handling:**
1. Role limits NOT enforced (fail-open approach)
2. Warning logged to console: "Supabase unavailable, role limits not enforced"
3. Login allowed to prevent blocking users
4. Research tracking unavailable
5. Participant data will be incomplete
6. Heartbeat system inactive
7. Normal functionality resumes when connection restored

---

## Future Enhancements

### Planned Features

1. **Green Team & Red Team Interfaces**
   - Currently inactive
   - Full role implementations
   - Cross-team visibility

2. **Advanced Analytics**
   - Decision pattern analysis
   - Team performance metrics
   - Outcome prediction models

3. **Enhanced Export**
   - Custom report builder
   - Data visualization
   - Interactive dashboards

4. **Collaboration Features**
   - In-app messaging
   - Shared annotations
   - Comment threads

5. **Mobile Support**
   - Responsive design improvements
   - Touch-optimized interfaces
   - Mobile-specific features

### Technical Improvements

1. **Code Consolidation** ✅ **COMPLETED**
   - ~~Merge `util.js` and `utils.js`~~ → Consolidated into `data-layer.js`
   - ~~Reduce duplication~~ → Single source of truth established
   - ~~Standardize naming~~ → Consistent `window.esg` API

2. **Testing Framework**
   - Unit tests for utilities
   - Integration tests for flows
   - E2E tests for critical paths

3. **Performance Optimization**
   - Lazy loading
   - Data pagination
   - Subscription optimization

4. **Security Enhancements**
   - Environment variables for credentials
   - Row-level security policies
   - Input sanitization

5. **Documentation**
   - API documentation
   - Developer guide
   - User manual

---

## Appendix

### A. Enum Definitions

**Mechanisms:**
- sanctions
- export
- investment
- trade
- financial
- economic
- industrial
- infrastructure

**Sectors:**
- biotechnology
- agriculture
- telecommunications
- semiconductors
- energy
- finance

**Exposure Types:**
- Supply Chain
- Cyber
- Financial
- Industrial
- Trade

**Request Priority:**
- NORMAL
- HIGH
- URGENT

**Observation Types:**
- NOTE
- MOMENT
- QUOTE

**Action Status:**
- DRAFT
- SUBMITTED
- ADJUDICATED
- ABANDONED

**Outcome Types:**
- SUCCESS
- PARTIAL_SUCCESS
- FAIL
- BACKFIRE

### B. Key Naming Conventions

**localStorage Keys:**
- `esg:move:{move}:{role}` - Role-specific move data
- `esg:sharedState` - Global game state
- `esg:sharedTimer` - Timer state
- `_timelineUpdate` - Timeline broadcast event

**Supabase Filters:**
- `session_id=eq.{session_id}` - Session isolation
- `move=eq.{move}` - Move filtering
- `is_deleted=eq.false` - Soft delete filtering

### C. Phase Durations

**Recommended Timings:**
- Phase 1: 30-40 minutes
- Phase 2: 20-30 minutes
- Phase 3: 10-15 minutes
- Phase 4: 15-20 minutes
- Phase 5: 10-15 minutes

**Total per Move:** ~90-120 minutes

**Total Simulation:** ~4.5-6 hours (3 moves)

### D. Role Slot Limits & Heartbeat Configuration

**Role Limits Configuration:**
```javascript
const ROLE_LIMITS = {
    'blue_facilitator': 1,    // Only 1 facilitator per session
    'blue_whitecell': 1,       // Only 1 white cell per session
    'blue_notetaker': 2,       // Up to 2 notetakers per session
    'white': 1,                // Only 1 Game Master
    'viewer': 999              // Unlimited viewers
};
```

**Heartbeat Configuration:**
- **Interval:** 30,000 ms (30 seconds)
- **Timeout:** 120 seconds (2 minutes)
- **Auto-disconnect on page close:** Enabled via `beforeunload` event
- **Stale connection threshold:** Connections with no heartbeat for >2 minutes

**Role Display Names:**
```javascript
const ROLE_DISPLAY_NAMES = {
    'blue_facilitator': 'Blue Team Facilitator',
    'blue_notetaker': 'Blue Team Notetaker',
    'blue_whitecell': 'Blue Team White Cell',
    'white': 'Game Master'
};
```

**Database Tables for Participant Tracking:**
- `participants` - Stores participant metadata, client IDs, and roles
- `session_participants` - Tracks active sessions, join times, heartbeats, and connection status
- Indexes: `(session_id, role, is_active)`, `heartbeat_at`

---

**End of Project Specification**

