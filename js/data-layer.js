/**
 * data-layer.js - Unified Data Layer for ESG Demo Platform
 * 
 * Combines Supabase database operations with LocalStorage fallback,
 * data validation, migration, backup/restore, and offline support.
 * 
 * Architecture:
 * - Primary: Supabase (multi-user, real-time, persistent)
 * - Fallback: LocalStorage (offline, single-user, development)
 * - Features: Validation, migration, deduplication, error handling
 */

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================

// Supabase Configuration
const SUPABASE_URL = 'https://hespvaxdbxgvkrojlxqq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlc3B2YXhkYnhndmtyb2pseHFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDE0NTUsImV4cCI6MjA4MDg3NzQ1NX0.QIcpk0Ehg_hPX3fDMPq8WkgrHRGzuWbQEqf8xkFVkhg';

// Initialize Supabase client
let db = null;
let isSupabaseAvailable = false;

if (typeof supabase !== 'undefined') {
    const { createClient } = supabase;
    db = createClient(SUPABASE_URL, SUPABASE_KEY);
    isSupabaseAvailable = true;
} else {
    console.warn('Supabase not loaded. Falling back to LocalStorage mode.');
}

// State Variables
let CURRENT_SESSION_ID = sessionStorage.getItem('esg_session_id') || null;
let CURRENT_CLIENT_ID = sessionStorage.getItem('esg_client_id');

// Generate Client ID (HTTPS safe fallback)
if (!CURRENT_CLIENT_ID) {
    if (window.crypto && window.crypto.randomUUID) {
        CURRENT_CLIENT_ID = crypto.randomUUID();
    } else {
        CURRENT_CLIENT_ID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    sessionStorage.setItem('esg_client_id', CURRENT_CLIENT_ID);
}

// Enums and Constants
const ENUMS = {
    requestPriority: ['NORMAL', 'HIGH', 'URGENT'],
    observationType: ['NOTE', 'MOMENT', 'QUOTE'],
    whiteCommTypes: ['GAME_UPDATE', 'RFI_RESPONSE'],
    mechanism: ['sanctions', 'export', 'investment', 'trade', 'financial', 'economic', 'industrial', 'infrastructure'],
    sector: ['biotechnology', 'agriculture', 'telecommunications', 'semiconductors', 'energy', 'finance'],
    exposure_type: ['Supply Chain', 'Cyber', 'Financial', 'Industrial', 'Trade']
};

const CATEGORY_LABELS = {
    economic: 'Economic Data',
    trade: 'Trade Data',
    alliance: 'Alliance Status',
    tech: 'Tech Assessment',
};

const STORAGE_KEYS = {
    sharedState: 'esg:sharedState',
    sharedTimer: 'esg:sharedTimer'
};

// Auth Config
const ROLES = {
    'white': 'admin2025',
    'blue': 'blue_beta',
    'blue_facilitator': 'facilitator2025',
    'blue_notetaker': 'notetaker2025',
    'blue_whitecell': 'whitecell2025',
    'red': 'red_team',
    'green': 'green_team',
    'viewer': 'observer'
};

// Role Management Configuration (for login slot limits)
const ROLE_LIMITS = {
    'blue_facilitator': 1,
    'blue_whitecell': 1,
    'blue_notetaker': 2,
    'white': 1,
    'viewer': 999
};

const ROLE_DISPLAY_NAMES = {
    'blue_facilitator': 'Blue Team Facilitator',
    'blue_whitecell': 'White Cell',
    'blue_notetaker': 'Blue Team Notetaker',
    'white': 'Game Master',
    'viewer': 'Viewer'
};

// Heartbeat configuration
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT_SECONDS = 120; // 2 minutes


// ==========================================
// 2. STORAGE UTILITIES (LocalStorage)
// ==========================================

function buildMoveKey(move, role) {
    return `esg:move:${move}:${role}`;
}

function readJSON(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        console.error('readJSON failed', key, e);
        return fallback;
    }
}

function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('writeJSON failed', key, e);
        if (e.name === 'QuotaExceededError') {
            showToast('Storage full. Please export data and clear storage.', 5000);
        } else {
            showToast('Save failed: storage unavailable');
        }
        return false;
    }
}

function mergeJSON(key, updater, fallback = {}) {
    const current = readJSON(key, fallback) || fallback;
    const next = updater(current);
    writeJSON(key, next);
    return next;
}

function safeGetItem(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.error('safeGetItem error', key, e);
        return fallback;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('safeSetItem error', key, e);
        return false;
    }
}

/**
 * Atomic update with optimistic locking to prevent concurrent write conflicts
 * @param {string} key - LocalStorage key
 * @param {function} updater - Function that takes current value and returns new value
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {boolean} - Success status
 */
function atomicUpdate(key, updater, maxRetries = 5) {
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            // Read current state with version
            const raw = localStorage.getItem(key);
            let current = raw ? JSON.parse(raw) : null;

            // Initialize version if not present
            if (!current || typeof current._version !== 'number') {
                current = current || {};
                current._version = 0;
            }

            const expectedVersion = current._version;

            // Apply update
            const updated = updater(current);

            // Increment version
            updated._version = expectedVersion + 1;

            // Try to write with version check
            // Read again to check if version changed
            const checkRaw = localStorage.getItem(key);
            const checkData = checkRaw ? JSON.parse(checkRaw) : null;
            const currentVersion = checkData?._version || 0;

            if (currentVersion !== expectedVersion) {
                // Version mismatch - someone else wrote in between
                attempts++;
                console.warn(`Concurrent write detected on ${key}, retrying (attempt ${attempts}/${maxRetries})`);

                // Exponential backoff
                const delay = Math.min(50 * Math.pow(2, attempts), 500);
                // Busy wait (not ideal but works for short delays)
                const start = Date.now();
                while (Date.now() - start < delay) {
                    // Busy wait
                }
                continue;
            }

            // Write the updated data
            localStorage.setItem(key, JSON.stringify(updated));

            // Verify write succeeded
            const verifyRaw = localStorage.getItem(key);
            const verifyData = verifyRaw ? JSON.parse(verifyRaw) : null;

            if (verifyData?._version === updated._version) {
                return true; // Success!
            } else {
                attempts++;
                console.warn(`Write verification failed on ${key}, retrying (attempt ${attempts}/${maxRetries})`);
                continue;
            }

        } catch (e) {
            console.error(`atomicUpdate error on ${key}:`, e);
            attempts++;
            if (attempts >= maxRetries) {
                return false;
            }
        }
    }

    console.error(`atomicUpdate failed after ${maxRetries} attempts on ${key}`);
    return false;
}


function safeJSONParse(jsonString, fallback = null) {
    if (!jsonString) return fallback;
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('JSON parse error:', e);
        return fallback;
    }
}

// ==========================================
// 3. DATA VALIDATION & NORMALIZATION
// ==========================================

function toIsoNow() {
    try {
        return new Date().toISOString();
    } catch {
        return null;
    }
}

function normalizePriority(p) {
    if (!p) return null;
    const up = String(p).toUpperCase();
    return ENUMS.requestPriority.includes(up) ? up : null;
}

function normalizeObservationType(t) {
    if (!t) return null;
    const up = String(t).toUpperCase();
    return ENUMS.observationType.includes(up) ? up : null;
}

function isValidEnum(key, value) {
    const list = ENUMS[key];
    if (!list) return true;
    const v = String(value);
    return list.includes(v) || list.includes(v.toLowerCase());
}

function normalizeEnum(key, value) {
    if (!value) return null;
    const list = ENUMS[key];
    if (!list) return value;
    const valLower = String(value).toLowerCase();
    const found = list.find(x => x.toLowerCase() === valLower);
    return found || value;
}

function mapCategoriesToLabels(keys) {
    if (!Array.isArray(keys)) return [];
    return keys.map(k => CATEGORY_LABELS[k] || k).filter(Boolean);
}

function validateData(data, schema) {
    if (!data || typeof data !== 'object') return false;
    for (const key in schema) {
        if (schema[key].required && !(key in data)) {
            console.warn(`Validation failed: required field '${key}' missing`);
            return false;
        }
        if (data[key] !== undefined && data[key] !== null && schema[key].type) {
            const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
            if (actualType !== schema[key].type) {
                console.warn(`Validation failed: field '${key}' expected type '${schema[key].type}', got '${actualType}'`);
                return false;
            }
        }
    }
    return true;
}

function validateDataStrict(data, schema, strict = false) {
    if (!data || typeof data !== 'object') {
        return strict ? null : {};
    }

    const validated = {};
    let hasErrors = false;

    for (const key in schema) {
        if (schema[key].required && !(key in data)) {
            if (strict) {
                console.error(`Strict validation failed: required field '${key}' missing`);
                return null;
            }
            hasErrors = true;
            if (schema[key].default !== undefined) {
                validated[key] = schema[key].default;
            }
        } else if (data[key] !== undefined && data[key] !== null) {
            const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
            if (schema[key].type && actualType !== schema[key].type) {
                if (strict) {
                    console.error(`Strict validation failed: field '${key}' type mismatch`);
                    return null;
                }
                hasErrors = true;
                if (schema[key].default !== undefined) {
                    validated[key] = schema[key].default;
                }
            } else {
                validated[key] = data[key];
            }
        } else if (schema[key].default !== undefined) {
            validated[key] = schema[key].default;
        }
    }

    if (strict && hasErrors) {
        return null;
    }

    return validated;
}

// ==========================================
// 4. DEDUPLICATION & SEARCH
// ==========================================

function deduplicateTimelineItems(items) {
    if (!Array.isArray(items)) return [];

    const seen = new Map();
    const deduplicated = [];

    for (const item of items) {
        let key;
        if (item.id) {
            key = `id:${item.id}`;
        } else {
            const timestamp = item.timestamp || (item.time ? new Date(item.time).getTime() : 0);
            const team = item.team || 'unknown';
            const contentHash = item.content ?
                (item.content.length > 100 ? item.content.substring(0, 100) : item.content) : '';
            key = `ts:${timestamp}_team:${team}_hash:${contentHash}`;
        }

        if (!seen.has(key)) {
            seen.set(key, true);
            deduplicated.push(item);
        } else {
            const existingIndex = deduplicated.findIndex(i => {
                if (item.id && i.id) {
                    return i.id === item.id;
                }
                const iTimestamp = i.timestamp || (i.time ? new Date(i.time).getTime() : 0);
                const iTeam = i.team || 'unknown';
                const iContentHash = i.content ?
                    (i.content.length > 100 ? i.content.substring(0, 100) : i.content) : '';
                const iKey = i.id ? `id:${i.id}` : `ts:${iTimestamp}_team:${iTeam}_hash:${iContentHash}`;
                return iKey === key;
            });

            if (existingIndex !== -1) {
                const existing = deduplicated[existingIndex];
                const itemCompleteness = (item.content?.length || 0) + Object.keys(item).length;
                const existingCompleteness = (existing.content?.length || 0) + Object.keys(existing).length;

                if (itemCompleteness > existingCompleteness) {
                    deduplicated[existingIndex] = item;
                }
            }
        }
    }

    return deduplicated.sort((a, b) => {
        const timeA = a.timestamp || (a.time ? new Date(a.time).getTime() : 0);
        const timeB = b.timestamp || (b.time ? new Date(b.time).getTime() : 0);
        return timeB - timeA;
    });
}

function searchItems(items, query, fields = []) {
    if (!query || !query.trim()) return items;
    const lowerQuery = query.toLowerCase();
    return items.filter(item => {
        if (fields.length === 0) {
            return Object.values(item).some(val => {
                if (typeof val === 'string') {
                    return val.toLowerCase().includes(lowerQuery);
                }
                if (Array.isArray(val)) {
                    return val.some(v => String(v).toLowerCase().includes(lowerQuery));
                }
                return false;
            });
        }
        return fields.some(field => {
            const val = item[field];
            if (typeof val === 'string') {
                return val.toLowerCase().includes(lowerQuery);
            }
            if (Array.isArray(val)) {
                return val.some(v => String(v).toLowerCase().includes(lowerQuery));
            }
            return String(val).toLowerCase().includes(lowerQuery);
        });
    });
}

// ==========================================
// 5. MIGRATION & BACKUP
// ==========================================

function createBackup(sessionId) {
    const backup = {
        version: '1.0',
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        data: {}
    };

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.includes(sessionId) || key.includes('currentSessionId')) {
            try {
                backup.data[key] = localStorage.getItem(key);
            } catch (e) {
                console.error(`Error backing up key ${key}:`, e);
            }
        }
    }

    return backup;
}

function restoreBackup(backup) {
    if (!backup || !backup.data) {
        return false;
    }

    try {
        for (const key in backup.data) {
            localStorage.setItem(key, backup.data[key]);
        }
        return true;
    } catch (e) {
        console.error('Error restoring backup:', e);
        return false;
    }
}

function migrateData(sessionId) {
    const migrationKey = `data_migrated_session_${sessionId}`;
    if (localStorage.getItem(migrationKey)) {
        return false;
    }

    let backupCreated = false;
    try {
        const backup = createBackup(sessionId);
        if (backup && Object.keys(backup.data).length > 0) {
            const backupKey = `migration_backup_${sessionId}_${Date.now()}`;
            try {
                localStorage.setItem(backupKey, JSON.stringify(backup));
                backupCreated = true;
                console.log('Migration backup created:', backupKey);
                showToast('Data migration backup created', 3000);
            } catch (e) {
                console.error('Failed to store migration backup:', e);
                try {
                    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `migration_backup_${sessionId}_${new Date().toISOString().split('T')[0]}.json`;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    backupCreated = true;
                    console.log('Migration backup exported as download');
                } catch (exportError) {
                    console.error('Failed to export migration backup:', exportError);
                }
            }
        }
    } catch (backupError) {
        console.error('Error creating migration backup:', backupError);
        showToast('Warning: Could not create migration backup', 5000);
    }

    let migrated = false;

    for (let move = 1; move <= 3; move++) {
        const migrations = [
            { old: `blueRequests_move_${move}`, new: `blueRequests_session_${sessionId}_move_${move}` },
            { old: `blueActions_move_${move}`, new: `blueActions_session_${sessionId}_move_${move}` },
            { old: `adjudications_move_${move}`, new: `adjudications_session_${sessionId}_move_${move}` },
            { old: `whiteCell_move_${move}`, new: `whiteCell_session_${sessionId}_move_${move}` },
            { old: `communications_move_${move}`, new: `communications_session_${sessionId}_move_${move}` },
            { old: `blueFacilitatorMove${move}`, new: `notes_session_${sessionId}_move_${move}` },
            { old: `blueActionsSubmittedMove${move}`, new: `blueActions_session_${sessionId}_move_${move}` },
            { old: `blueRequestsSubmittedMove${move}`, new: `blueRequests_session_${sessionId}_move_${move}` }
        ];

        for (const { old, new: newKey } of migrations) {
            if (localStorage.getItem(old) && !localStorage.getItem(newKey)) {
                const oldData = safeGetItem(old, null);
                if (oldData && safeSetItem(newKey, oldData)) {
                    migrated = true;
                }
            }
        }
    }

    if (migrated) {
        try {
            const migrationResult = safeSetItem(migrationKey, {
                migratedAt: new Date().toISOString(),
                sessionId,
                backupCreated: backupCreated
            });

            if (migrationResult) {
                console.log('Data migration completed for session:', sessionId);
                showToast('Data migration completed successfully', 3000);
            }
        } catch (e) {
            console.error('Error marking migration complete:', e);
        }
    }

    return migrated;
}

function cleanupLegacyKeys(sessionId) {
    const legacyPatterns = [
        /^blueRequests_move_\d+$/,
        /^blueActions_move_\d+$/,
        /^communications_move_\d+$/,
        /^whiteCell_move_\d+$/,
        /^blueFacilitatorMove\d+$/,
        /^blueActionsSubmittedMove\d+$/,
        /^blueRequestsSubmittedMove\d+$/
    ];

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (legacyPatterns.some(pattern => pattern.test(key))) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(key => {
        try {
            localStorage.removeItem(key);
            console.log('Removed legacy key:', key);
        } catch (e) {
            console.error('Error removing legacy key:', key, e);
        }
    });

    return keysToRemove.length;
}

// ==========================================
// 6. ERROR HANDLING
// ==========================================

function withErrorHandling(fn, context = 'Operation') {
    return async function (...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            console.error(`${context} error:`, error);
            const errorMsg = error.message || error.toString() || 'Unknown error';
            showToast(`${context} failed: ${errorMsg}`, 4000);
            throw error;
        }
    };
}

function withErrorHandlingSync(fn, context = 'Operation', fallback = null) {
    return function (...args) {
        try {
            return fn.apply(this, args);
        } catch (error) {
            console.error(`${context} error:`, error);
            const errorMsg = error.message || error.toString() || 'Unknown error';
            showToast(`${context} failed: ${errorMsg}`, 4000);
            return fallback;
        }
    };
}

// ==========================================
// 7. UI UTILITIES
// ==========================================

let toastQueue = [];
let toastTimeout = null;
let isToastShowing = false;

function showToast(message, duration = 2500) {
    toastQueue.push({ message, duration });

    if (!isToastShowing) {
        showNextToast();
    }
}

function showNextToast() {
    if (toastQueue.length === 0) {
        isToastShowing = false;
        return;
    }

    isToastShowing = true;
    const { message, duration } = toastQueue.shift();

    let toast = document.getElementById('globalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalToast';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = 'rgba(26,68,128,0.95)';
        toast.style.color = '#fff';
        toast.style.padding = '10px 14px';
        toast.style.borderRadius = '6px';
        toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
        toast.style.zIndex = '2000';
        toast.style.transition = 'opacity 0.3s';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            isToastShowing = false;
            showNextToast();
        }, 300);
    }, duration);
}

function formatForUi(tsIso) {
    try {
        return new Date(tsIso).toLocaleString();
    } catch {
        return tsIso;
    }
}

function makeActionId() {
    return `act_${Date.now()}`;
}

function makeRequestId() {
    return `req_${Date.now()}`;
}

function mapPhaseEnum(num) {
    const map = {
        1: 'Internal Deliberation',
        2: 'Alliance Consultation',
        3: 'Finalization',
        4: 'Adjudication',
        5: 'Results Brief'
    };
    return map[num] || 'Internal Deliberation';
}

function getSessionId() {
    // Prioritize sessionStorage (set by joinSession)
    if (CURRENT_SESSION_ID) return CURRENT_SESSION_ID;

    // Fallback to URL params
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('sessionId');

    return fromQuery || 'default-session';
}

// ==========================================
// 8. LOCALSTORAGE TIMELINE (Offline Support)
// ==========================================

async function appendTimelineItem(move, item) {
    const required = ['phase', 'type', 'title', 'content', 'team'];
    for (const k of required) {
        if (!item[k]) {
            console.warn('appendTimelineItem: Missing required field:', k);
            return;
        }
    }

    let phaseNum = item.phase;
    if (typeof phaseNum === 'string') {
        const phaseMap = {
            'Internal Deliberation': 1,
            'Alliance Consultation': 2,
            'Finalization': 3,
            'Adjudication': 4,
            'Results Brief': 5
        };
        phaseNum = phaseMap[phaseNum] || parseInt(phaseNum) || 1;
    }

    const event = {
        id: item.id || Date.now() + Math.random(),
        move: move,
        phase: phaseNum,
        time: new Date().toISOString(),
        timestamp: Date.now(),
        type: item.type,
        title: item.title,
        content: item.content,
        team: item.team,
        refs: item.refs || {}
    };

    const key = `whiteCell_move_${move}`;

    let retries = 3;
    while (retries > 0) {
        try {
            const stored = JSON.parse(localStorage.getItem(key) || '{}');
            const timeline = stored.timelineItems || [];

            if (event.id && timeline.some(t => t.id === event.id)) {
                console.warn('Timeline item with same ID already exists, skipping');
                return;
            }

            timeline.push(event);
            stored.timelineItems = timeline;
            localStorage.setItem(key, JSON.stringify(stored));
            localStorage.setItem('_timelineUpdate', JSON.stringify({
                moveNumber: move,
                item: event,
                team: item.team,
                timestamp: Date.now()
            }));
            return;
        } catch (e) {
            retries--;
            if (e.name === 'QuotaExceededError') {
                console.error('Storage quota exceeded while appending timeline item');
                showToast('Storage full. Please export data and clear storage.', 5000);
                return;
            }
            if (retries === 0) {
                console.error('Error appending timeline item after retries:', e);
                showToast('Failed to save timeline item. Please try again.', 3000);
            } else {
                await new Promise(resolve => setTimeout(resolve, 50 * (4 - retries)));
            }
        }
    }
}

// ==========================================
// 9. DATABASE OPERATIONS (Supabase)
// ==========================================

async function testConnection() {
    if (!isSupabaseAvailable) {
        console.warn('Supabase not available. Using LocalStorage mode.');
        return false;
    }

    console.log("Testing connection to:", SUPABASE_URL);
    const { data, error } = await db.from('sessions').select('count').single();
    if (error) {
        console.error("CONNECTION FAILED:", error.message);
        return false;
    }
    console.log("CONNECTION SUCCESSFUL. DB is reachable.");
    return true;
}

// Session Management
async function createSession(name) {
    if (!isSupabaseAvailable) {
        const sessionId = `local_${Date.now()}`;
        const session = { id: sessionId, name, status: 'active', metadata: {}, created_at: new Date().toISOString() };
        safeSetItem(`session_${sessionId}`, session);
        return sessionId;
    }

    const { data, error } = await db.from('sessions')
        .insert([{ name: name, status: 'active', metadata: {} }])
        .select()
        .single();

    if (data) {
        await db.from('game_state').insert([{ session_id: data.id }]);
        return data.id;
    }
    console.error("Session Create Error:", error);
    return null;
}

async function fetchAllSessions(includeArchived = false) {
    if (!isSupabaseAvailable) {
        const sessions = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('session_')) {
                const session = safeGetItem(key);
                if (session && (includeArchived || session.status === 'active')) {
                    sessions.push(session);
                }
            }
        }
        return sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    let query = db.from('sessions').select('*');

    if (!includeArchived) {
        query = query.eq('status', 'active');
    } else {
        query = query.in('status', ['active', 'archived']);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Fetch sessions error:', error);
        return [];
    }
    return data || [];
}

async function deleteSession(sessionId, hardDelete = false) {
    if (!sessionId) {
        console.error('deleteSession: No sessionId provided');
        return false;
    }

    if (!isSupabaseAvailable) {
        if (hardDelete) {
            localStorage.removeItem(`session_${sessionId}`);
        } else {
            const session = safeGetItem(`session_${sessionId}`);
            if (session) {
                session.status = 'archived';
                safeSetItem(`session_${sessionId}`, session);
            }
        }
        return true;
    }

    if (hardDelete) {
        const { data, error } = await db.from('sessions')
            .delete()
            .eq('id', sessionId)
            .select();

        if (error) {
            console.error('Delete session error:', error);
            return false;
        }

        if (!data || data.length === 0) {
            console.warn('deleteSession: No session found with id:', sessionId);
            return false;
        }

        return true;
    } else {
        const { data: existingSession, error: checkError } = await db.from('sessions')
            .select('id, status')
            .eq('id', sessionId)
            .single();

        if (checkError || !existingSession) {
            console.error('Error checking session existence:', checkError);
            return false;
        }

        const { data, error } = await db.from('sessions')
            .update({ status: 'archived' })
            .eq('id', sessionId)
            .select();

        if (error) {
            console.error('Archive session error:', error);
            return false;
        }

        if (!data || data.length === 0) {
            console.warn('deleteSession: No rows updated for session:', sessionId);
            return false;
        }

        return true;
    }
}

async function joinSession(sessionId) {
    if (!isSupabaseAvailable) {
        const session = safeGetItem(`session_${sessionId}`);
        if (session) {
            CURRENT_SESSION_ID = sessionId;
            sessionStorage.setItem('esg_session_id', sessionId);
            return true;
        }
        return false;
    }

    try {
        const { data, error } = await db.from('sessions').select('*').eq('id', sessionId).single();

        // Check for errors or no data
        if (error || !data) {
            console.log('Session not found:', sessionId, error);
            return false;
        }

        CURRENT_SESSION_ID = sessionId;
        sessionStorage.setItem('esg_session_id', sessionId);

        try {
            const currentMetadata = await getSessionMetadata();
            const participants = currentMetadata?.participants || {};
            const role = sessionStorage.getItem('esg_role') || 'participant';

            participants[CURRENT_CLIENT_ID] = {
                ...participants[CURRENT_CLIENT_ID],
                role: role,
                last_seen: new Date().toISOString(),
                joined_at: participants[CURRENT_CLIENT_ID]?.joined_at || new Date().toISOString()
            };

            await updateSessionMetadata({ participants });
        } catch (error) {
            console.error('Error recording participant join:', error);
        }

        return true;
    } catch (error) {
        // Handle any database errors (including session not found)
        console.error('Error joining session:', error);
        return false;
    }
}

async function getSessionMetadata() {
    const sessionId = CURRENT_SESSION_ID || sessionStorage.getItem('esg_session_id');
    if (!sessionId) {
        console.warn('getSessionMetadata: No session ID available');
        return null;
    }

    if (!isSupabaseAvailable) {
        const session = safeGetItem(`session_${sessionId}`);
        return session?.metadata || {};
    }

    const { data, error } = await db.from('sessions').select('metadata').eq('id', sessionId).single();
    if (error) {
        console.error('getSessionMetadata error:', error);
        return null;
    }
    return data?.metadata || {};
}

async function updateSessionMetadata(updates) {
    const sessionId = CURRENT_SESSION_ID || sessionStorage.getItem('esg_session_id');
    if (!sessionId) {
        console.warn('updateSessionMetadata: No session ID available');
        return false;
    }

    if (!isSupabaseAvailable) {
        const session = safeGetItem(`session_${sessionId}`);
        if (session) {
            session.metadata = { ...session.metadata, ...updates };
            return safeSetItem(`session_${sessionId}`, session);
        }
        return false;
    }

    const current = await getSessionMetadata();
    const newMetadata = { ...current, ...updates };
    const { error } = await db.from('sessions')
        .update({ metadata: newMetadata })
        .eq('id', sessionId);
    if (error) {
        console.error('updateSessionMetadata error:', error);
        return false;
    }
    return true;
}

async function getSessionName() {
    const sessionId = CURRENT_SESSION_ID || sessionStorage.getItem('esg_session_id');
    if (!sessionId) {
        return null;
    }

    if (!isSupabaseAvailable) {
        const session = safeGetItem(`session_${sessionId}`);
        return session?.name || null;
    }

    const { data, error } = await db.from('sessions').select('name').eq('id', sessionId).single();
    if (error) {
        console.error('getSessionName error:', error);
        return null;
    }
    return data?.name || null;
}

// Authentication
function login(role, password) {
    if (ROLES[role] === password) {
        sessionStorage.setItem('esg_role', role);
        return true;
    }
    return false;
}

function checkAuth() {
    const role = sessionStorage.getItem('esg_role');
    if (!role) {
        window.location.href = 'index.html';
        return null;
    }
    return role;
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

// ==========================================
// ROLE MANAGEMENT (Login Slot Control)
// ==========================================

/**
 * Check if a role slot is available in a session
 * @param {string} sessionId - Session UUID
 * @param {string} role - Role to check
 * @returns {Promise<Object>} Availability status
 */
async function checkRoleAvailability(sessionId, role) {
    if (!isSupabaseAvailable) {
        console.warn('Role limits not enforced in offline mode');
        return { available: true, reason: 'offline_mode' };
    }

    try {
        // Validate UUID format before querying database
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
        if (!isUUID) {
            console.warn('checkRoleAvailability: Invalid session ID format', sessionId);
            // Allow login to proceed to joinSession which will handle the "not found" error
            return { available: true };
        }

        const limit = ROLE_LIMITS[role] || 1;

        // Query active participants for this role
        const { data: activeParticipants, error } = await db
            .from('session_participants')
            .select('id, participant_id, heartbeat_at, participants(name)')
            .eq('session_id', sessionId)
            .eq('role', role)
            .eq('is_active', true);

        if (error) throw error;

        // Filter out stale connections (no heartbeat in timeout period)
        const now = new Date();
        const activeCount = activeParticipants.filter(p => {
            const heartbeat = new Date(p.heartbeat_at);
            const secondsSinceHeartbeat = (now - heartbeat) / 1000;
            return secondsSinceHeartbeat < HEARTBEAT_TIMEOUT_SECONDS;
        }).length;

        if (activeCount >= limit) {
            return {
                available: false,
                reason: 'role_full',
                current: activeCount,
                limit: limit,
                activeParticipants: activeParticipants.filter(p => {
                    const heartbeat = new Date(p.heartbeat_at);
                    const secondsSinceHeartbeat = (now - heartbeat) / 1000;
                    return secondsSinceHeartbeat < HEARTBEAT_TIMEOUT_SECONDS;
                })
            };
        }

        return {
            available: true,
            current: activeCount,
            limit: limit
        };
    } catch (error) {
        console.error('Error checking role availability:', error);
        // Fail open - allow login if check fails
        return { available: true, reason: 'check_failed', error: error.message };
    }
}

/**
 * Register a participant for a session
 * @param {string} sessionId - Session UUID
 * @param {string} clientId - Client identifier
 * @param {string} role - Participant role
 * @returns {Promise<Object>} Session participant record
 */
async function registerSessionParticipant(sessionId, clientId, role) {
    if (!isSupabaseAvailable) {
        console.warn('Participant registration requires Supabase');
        return null;
    }

    try {
        // Ensure participant exists
        const { data: participant, error: participantError } = await db
            .from('participants')
            .upsert([{
                client_id: clientId,
                role: role,
                updated_at: new Date().toISOString()
            }], { onConflict: 'client_id' })
            .select()
            .single();

        if (participantError) throw participantError;

        // Check for existing active session_participant
        const { data: existing } = await db
            .from('session_participants')
            .select('*')
            .eq('session_id', sessionId)
            .eq('participant_id', participant.id)
            .maybeSingle();

        if (existing) {
            // Reactivate if inactive, or update heartbeat if active
            const { data: updated, error: updateError } = await db
                .from('session_participants')
                .update({
                    is_active: true,
                    heartbeat_at: new Date().toISOString(),
                    last_seen: new Date().toISOString(),
                    disconnected_at: null
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (updateError) throw updateError;
            return updated;
        }

        // Create new session_participant record
        const { data: sessionParticipant, error: insertError } = await db
            .from('session_participants')
            .insert([{
                session_id: sessionId,
                participant_id: participant.id,
                role: role,
                joined_at: new Date().toISOString(),
                last_seen: new Date().toISOString(),
                is_active: true,
                heartbeat_at: new Date().toISOString(),
                total_active_time: 0,
                contributions_count: 0
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        console.log('Session participant registered:', sessionParticipant);
        return sessionParticipant;
    } catch (error) {
        console.error('Error registering session participant:', error);
        return null;
    }
}

/**
 * Mark a participant as disconnected
 * @param {string} sessionId - Session UUID
 * @param {string} clientId - Client identifier
 */
async function disconnectParticipant(sessionId, clientId) {
    if (!isSupabaseAvailable) return;

    try {
        const { data: participant } = await db
            .from('participants')
            .select('id')
            .eq('client_id', clientId)
            .single();

        if (!participant) return;

        await db
            .from('session_participants')
            .update({
                is_active: false,
                disconnected_at: new Date().toISOString()
            })
            .eq('session_id', sessionId)
            .eq('participant_id', participant.id)
            .eq('is_active', true);

        console.log('Participant disconnected');
    } catch (error) {
        console.error('Error disconnecting participant:', error);
    }
}

/**
 * Disconnect all active participants for a role (for takeover)
 * @param {string} sessionId - Session UUID
 * @param {string} role - Role to clear
 */
async function disconnectExistingParticipants(sessionId, role) {
    if (!isSupabaseAvailable) return;

    try {
        await db
            .from('session_participants')
            .update({
                is_active: false,
                disconnected_at: new Date().toISOString()
            })
            .eq('session_id', sessionId)
            .eq('role', role)
            .eq('is_active', true);

        console.log(`Disconnected existing ${role} participants`);
    } catch (error) {
        console.error('Error disconnecting existing participants:', error);
    }
}


// Game State
async function fetchGameState() {
    if (!CURRENT_SESSION_ID) return null;

    if (!isSupabaseAvailable) {
        const gameState = safeGetItem(`game_state_${CURRENT_SESSION_ID}`, {
            move: 1,
            phase: 1,
            timer_seconds: 5400,
            timer_running: false
        });

        // Also check shared timer key for localStorage sync
        const timerState = safeGetItem(STORAGE_KEYS.sharedTimer, null);
        if (timerState) {
            gameState.timer = timerState;
            gameState.timer_seconds = timerState.seconds;
            gameState.timer_running = timerState.running;
            gameState.timer_last_update = timerState.lastUpdate ? new Date(timerState.lastUpdate).toISOString() : null;
        }

        return gameState;
    }

    const { data } = await db.from('game_state')
        .select('*')
        .eq('session_id', CURRENT_SESSION_ID)
        .single();

    if (data && (data.timer_seconds !== undefined || data.timer_running !== undefined)) {
        // Include timer in response if present
        data.timer = {
            seconds: data.timer_seconds || 5400,
            running: data.timer_running || false,
            lastUpdate: data.timer_last_update ? new Date(data.timer_last_update).getTime() : Date.now()
        };
    }

    return data;
}

async function updateGameState(updates) {
    if (!CURRENT_SESSION_ID) return;

    // Prepare update object with timer fields if provided
    const gameStateUpdate = {
        ...updates,
        last_updated: new Date().toISOString()
    };

    // If timer state is included in updates, extract and map to database fields
    if (updates.timer) {
        gameStateUpdate.timer_seconds = updates.timer.seconds;
        gameStateUpdate.timer_running = updates.timer.running;
        gameStateUpdate.timer_last_update = updates.timer.lastUpdate ? new Date(updates.timer.lastUpdate).toISOString() : new Date().toISOString();
        // Remove the nested timer object to avoid issues
        delete gameStateUpdate.timer;
    }

    if (!isSupabaseAvailable) {
        const current = safeGetItem(`game_state_${CURRENT_SESSION_ID}`, {});
        const updated = { ...current, ...gameStateUpdate };
        safeSetItem(`game_state_${CURRENT_SESSION_ID}`, updated);

        // Also update shared timer key for localStorage synchronization
        if (updates.timer) {
            safeSetItem(STORAGE_KEYS.sharedTimer, updates.timer);
        }
        return;
    }

    await db.from('game_state')
        .update(gameStateUpdate)
        .eq('session_id', CURRENT_SESSION_ID);
}

function subscribeToGameState(callback) {
    if (!CURRENT_SESSION_ID || !isSupabaseAvailable) return;
    db.channel(`game_state:${CURRENT_SESSION_ID}`)
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'game_state', filter: `session_id=eq.${CURRENT_SESSION_ID}` },
            (payload) => callback(payload.new)
        )
        .subscribe();
}

// Actions
async function submitAction(formData) {
    if (!CURRENT_SESSION_ID) return false;
    const state = await fetchGameState();

    const action = {
        session_id: CURRENT_SESSION_ID,
        created_at: new Date().toISOString(),
        move: state.move,
        phase: state.phase,
        team: 'blue',
        client_id: CURRENT_CLIENT_ID,
        mechanism: formData.mechanism,
        sector: formData.sector,
        exposure_type: formData.exposure,
        targets: formData.targets,
        goal: formData.goal,
        expected_outcomes: formData.outcomes,
        ally_contingencies: formData.contingencies,
        status: formData.status || 'submitted',
        // HIGH-4: Set submitted_at timestamp if status is submitted
        submitted_at: (formData.status === 'submitted' || !formData.status) ? new Date().toISOString() : null
    };

    if (!isSupabaseAvailable) {
        const key = `blueActions_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const actions = safeGetItem(key, { actions: [] });
        action.id = makeActionId();
        actions.actions.push(action);
        safeSetItem(key, actions);
        await postTimelineItem('blue', 'action_log', `Action ${action.status === 'draft' ? 'Created' : 'Submitted'}: ${formData.mechanism}`);
        return true;
    }

    const { data, error } = await db.from('actions').insert([action]).select();

    if (!error && data && data[0]) {
        // HIGH-4: Calculate draft duration if transitioning from draft to submitted
        if (window.researchTracking && formData.status === 'submitted') {
            await window.researchTracking.updateActionLifecycle(
                data[0].id,
                'submitted',
                { created_at: action.created_at }
            );
        }

        await postTimelineItem('blue', 'action_log', `Action ${action.status === 'draft' ? 'Created' : 'Submitted'}: ${formData.mechanism}`);
        await db.from('action_logs').insert([{
            action_id: data[0].id,
            session_id: CURRENT_SESSION_ID,
            new_state: formData,
            changed_by_role: 'blue_facilitator',
            client_id: CURRENT_CLIENT_ID
        }]);
        return true;
    }
    console.error("Submit Action Error:", error);
    return false;
}

async function updateAction(actionId, formData) {
    if (!CURRENT_SESSION_ID) return false;

    if (!isSupabaseAvailable) {
        const state = await fetchGameState();
        const key = `blueActions_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const actions = safeGetItem(key, { actions: [] });
        const actionIndex = actions.actions.findIndex(a => a.id === actionId);
        if (actionIndex !== -1) {
            const previousAction = actions.actions[actionIndex];
            actions.actions[actionIndex] = {
                ...previousAction,
                ...formData,
                updated_at: new Date().toISOString(),
                // HIGH-4: Set submitted_at if transitioning to submitted
                submitted_at: (formData.status === 'submitted' && previousAction.status !== 'submitted')
                    ? new Date().toISOString()
                    : previousAction.submitted_at
            };
            safeSetItem(key, actions);
            await postTimelineItem('blue', 'action_log', `Action Updated: ${formData.mechanism || 'status changed'}`);
            return true;
        }
        return false;
    }

    const { data: previous } = await db.from('actions').select('*').eq('id', actionId).single();

    // HIGH-4: Prepare update object with lifecycle timestamps
    const updateData = {
        updated_at: new Date().toISOString(),
        client_id: CURRENT_CLIENT_ID
    };

    // Add field updates if provided
    if (formData.mechanism !== undefined) updateData.mechanism = formData.mechanism;
    if (formData.sector !== undefined) updateData.sector = formData.sector;
    if (formData.exposure !== undefined) updateData.exposure_type = formData.exposure;
    if (formData.targets !== undefined) updateData.targets = formData.targets;
    if (formData.goal !== undefined) updateData.goal = formData.goal;
    if (formData.outcomes !== undefined) updateData.expected_outcomes = formData.outcomes;
    if (formData.contingencies !== undefined) updateData.ally_contingencies = formData.contingencies;

    // HIGH-4: Handle status transitions with timestamps
    if (formData.status !== undefined) {
        updateData.status = formData.status;

        // Set submitted_at when transitioning from draft to submitted
        if (formData.status === 'submitted' && previous && previous.status !== 'submitted') {
            updateData.submitted_at = new Date().toISOString();
        }
    }

    const { data, error } = await db.from('actions')
        .update(updateData)
        .eq('id', actionId)
        .select();

    if (!error) {
        // HIGH-4: Track lifecycle transition if status changed to submitted
        if (formData.status === 'submitted' && previous && previous.status !== 'submitted' && window.researchTracking) {
            await window.researchTracking.updateActionLifecycle(
                actionId,
                'submitted',
                previous
            );
        }

        await db.from('action_logs').insert([{
            action_id: actionId,
            session_id: CURRENT_SESSION_ID,
            previous_state: previous,
            new_state: formData,
            changed_by_role: 'blue_facilitator',
            client_id: CURRENT_CLIENT_ID
        }]);

        await postTimelineItem('blue', 'action_log', `Action Updated: ${formData.mechanism || 'status changed'}`);
        return true;
    }
    console.error("Update Action Error:", error);
    return false;
}

async function deleteAction(actionId) {
    if (!isSupabaseAvailable) {
        const state = await fetchGameState();
        const key = `blueActions_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const actions = safeGetItem(key, { actions: [] });
        const actionIndex = actions.actions.findIndex(a => a.id === actionId);
        if (actionIndex !== -1) {
            actions.actions[actionIndex].is_deleted = true;
            actions.actions[actionIndex].deleted_at = new Date().toISOString();
            actions.actions[actionIndex].status = 'abandoned';
            safeSetItem(key, actions);
            await postTimelineItem('blue', 'action_log', 'Action Draft Abandoned');
            return true;
        }
        return false;
    }

    const { error } = await db.from('actions')
        .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            status: 'abandoned'
        })
        .eq('id', actionId);

    if (!error) {
        await postTimelineItem('blue', 'action_log', 'Action Draft Abandoned');
        return true;
    }
    return false;
}

async function fetchActions(move, sessionId = CURRENT_SESSION_ID) {
    if (!sessionId) return [];

    if (!isSupabaseAvailable) {
        const key = `blueActions_session_${sessionId}_move_${move}`;
        const actions = safeGetItem(key, { actions: [] });
        return actions.actions.filter(a => !a.is_deleted);
    }

    const { data } = await db.from('actions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('move', move)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
    return data || [];
}

function subscribeToActions(callback) {
    if (!CURRENT_SESSION_ID || !isSupabaseAvailable) return;
    db.channel(`actions:${CURRENT_SESSION_ID}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'actions', filter: `session_id=eq.${CURRENT_SESSION_ID}` },
            (payload) => callback(payload)
        )
        .subscribe();
}

// Requests
async function submitRequest(formData) {
    if (!CURRENT_SESSION_ID) return;
    const state = await fetchGameState();

    const request = {
        session_id: CURRENT_SESSION_ID,
        move: state.move,
        phase: state.phase,
        team: 'blue',
        client_id: CURRENT_CLIENT_ID,
        priority: formData.priority,
        categories: formData.categories,
        query: formData.details,
        status: 'pending'
    };

    if (!isSupabaseAvailable) {
        const key = `blueRequests_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const requests = safeGetItem(key, []);
        request.id = makeRequestId();
        request.created_at = new Date().toISOString();
        requests.push(request);
        safeSetItem(key, requests);
        await postTimelineItem('blue', 'observation', `RFI Submitted: ${formData.details}`);
        return;
    }

    const { error } = await db.from('requests').insert([request]);

    if (!error) await postTimelineItem('blue', 'observation', `RFI Submitted: ${formData.details}`);
}

async function withdrawRequest(requestId) {
    if (!isSupabaseAvailable) {
        const state = await fetchGameState();
        const key = `blueRequests_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const requests = safeGetItem(key, []);
        const requestIndex = requests.findIndex(r => r.id === requestId);
        if (requestIndex !== -1) {
            requests[requestIndex].status = 'withdrawn';
            safeSetItem(key, requests);
            await postTimelineItem('blue', 'action_log', 'RFI/Request Withdrawn');
            return true;
        }
        return false;
    }

    const { error } = await db.from('requests')
        .update({ status: 'withdrawn' })
        .eq('id', requestId);

    if (!error) {
        await postTimelineItem('blue', 'action_log', 'RFI/Request Withdrawn');
        return true;
    }
    return false;
}

async function fetchRequests() {
    if (!CURRENT_SESSION_ID) return [];

    if (!isSupabaseAvailable) {
        const requests = [];
        for (let move = 1; move <= 3; move++) {
            const key = `blueRequests_session_${CURRENT_SESSION_ID}_move_${move}`;
            const moveRequests = safeGetItem(key, []);
            requests.push(...moveRequests.filter(r => r.status !== 'withdrawn'));
        }
        return requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const { data } = await db.from('requests')
        .select('*')
        .eq('session_id', CURRENT_SESSION_ID)
        .neq('status', 'withdrawn')
        .order('created_at', { ascending: false });
    return data || [];
}

function subscribeToRequests(callback) {
    if (!CURRENT_SESSION_ID || !isSupabaseAvailable) return;
    db.channel(`requests:${CURRENT_SESSION_ID}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'requests', filter: `session_id=eq.${CURRENT_SESSION_ID}` },
            (payload) => callback(payload)
        )
        .subscribe();
}

// Communications
async function sendResponse(requestObject, responseText) {
    if (!CURRENT_SESSION_ID) return;
    const state = await fetchGameState();

    const communication = {
        session_id: CURRENT_SESSION_ID,
        move: state.move,
        from_role: 'white',
        to_role: 'blue',
        type: 'rfi_response',
        title: `Re: ${requestObject.query.substring(0, 20)}...`,
        content: responseText,
        client_id: CURRENT_CLIENT_ID,
        linked_request_id: requestObject.id
    };

    if (!isSupabaseAvailable) {
        const key = `communications_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const comms = safeGetItem(key, []);
        communication.id = `comm_${Date.now()}`;
        communication.created_at = new Date().toISOString();
        comms.push(communication);
        safeSetItem(key, comms);

        // Search for request in all moves
        for (let m = 1; m <= 3; m++) {
            const reqKey = `blueRequests_session_${CURRENT_SESSION_ID}_move_${m}`;
            const requests = safeGetItem(reqKey, []);
            const reqIndex = requests.findIndex(r => r.id === requestObject.id);
            if (reqIndex !== -1) {
                requests[reqIndex].status = 'answered';
                requests[reqIndex].response = responseText;
                safeSetItem(reqKey, requests);
                break;
            }
        }

        await postTimelineItem('white', 'ruling', `RFI Answered: ${requestObject.query.substring(0, 30)}...`);
        return;
    }

    const { error } = await db.from('communications').insert([communication]);

    if (!error) {
        await db.from('requests')
            .update({ status: 'answered' })
            .eq('id', requestObject.id);

        await postTimelineItem('white', 'ruling', `RFI Answered: ${requestObject.query.substring(0, 30)}...`);
    }
}

async function fetchCommunications() {
    if (!CURRENT_SESSION_ID) return [];

    if (!isSupabaseAvailable) {
        const comms = [];
        for (let move = 1; move <= 3; move++) {
            const key = `communications_session_${CURRENT_SESSION_ID}_move_${move}`;
            const moveComms = safeGetItem(key, []);
            comms.push(...moveComms);
        }
        return comms.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const { data } = await db.from('communications')
        .select('*')
        .eq('session_id', CURRENT_SESSION_ID)
        .order('created_at', { ascending: false });
    return data || [];
}

function subscribeToCommunications(callback) {
    if (!CURRENT_SESSION_ID || !isSupabaseAvailable) return;
    db.channel(`comms:${CURRENT_SESSION_ID}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'communications', filter: `session_id=eq.${CURRENT_SESSION_ID}` },
            (payload) => callback(payload.new)
        )
        .subscribe();
}

// Adjudication
async function submitAdjudication(actionId, adjData) {
    if (!CURRENT_SESSION_ID) return;

    if (!isSupabaseAvailable) {
        const state = await fetchGameState();
        const key = `blueActions_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const actions = safeGetItem(key, { actions: [] });
        const actionIndex = actions.actions.findIndex(a => a.id === actionId);
        if (actionIndex !== -1) {
            actions.actions[actionIndex].status = 'adjudicated';
            actions.actions[actionIndex].adjudication = adjData;
            // HIGH-4: Add adjudicated_at timestamp
            actions.actions[actionIndex].adjudicated_at = new Date().toISOString();
            safeSetItem(key, actions);
            await postTimelineItem('white', 'ruling', `Action Adjudicated: ${adjData.outcome}`, { linked_action_id: actionId });
        }
        return;
    }

    // HIGH-4: Get current action state for lifecycle tracking
    const { data: currentAction } = await db
        .from('actions')
        .select('*')
        .eq('id', actionId)
        .single();

    const { error } = await db.from('actions')
        .update({
            status: 'adjudicated',
            adjudication: adjData,
            // HIGH-4: Set adjudicated_at timestamp
            adjudicated_at: new Date().toISOString()
        })
        .eq('id', actionId);

    if (!error) {
        // HIGH-4: Calculate submission to adjudication duration
        if (window.researchTracking && currentAction) {
            await window.researchTracking.updateActionLifecycle(
                actionId,
                'adjudicated',
                currentAction
            );
        }

        await postTimelineItem('white', 'ruling', `Action Adjudicated: ${adjData.outcome}`, { linked_action_id: actionId });
    }
}

// Timeline
async function fetchTimeline(move = null) {
    if (!CURRENT_SESSION_ID) return [];

    if (!isSupabaseAvailable) {
        const timeline = [];
        const moves = move ? [move] : [1, 2, 3];
        for (const m of moves) {
            const key = `whiteCell_session_${CURRENT_SESSION_ID}_move_${m}`;
            const moveData = safeGetItem(key, {});
            if (moveData.timelineItems) {
                timeline.push(...moveData.timelineItems);
            }
        }
        return deduplicateTimelineItems(timeline);
    }

    let query = db.from('timeline')
        .select('*')
        .eq('session_id', CURRENT_SESSION_ID);

    if (move) {
        query = query.eq('move', move);
    }

    const { data } = await query.order('created_at', { ascending: false });
    return data || [];
}

async function postTimelineItem(team, type, content, options = {}) {
    if (!CURRENT_SESSION_ID) return;
    const state = await fetchGameState();

    const item = {
        session_id: CURRENT_SESSION_ID,
        move: state.move,
        phase: state.phase,
        team: team,
        type: type,
        content: content,
        client_id: CURRENT_CLIENT_ID,
        category: options.category || null,
        faction_tag: options.faction || null,
        debate_marker: options.marker || null,
        metadata: options.metadata || {}
    };

    if (!isSupabaseAvailable) {
        await appendTimelineItem(state.move, {
            phase: state.phase,
            type: type,
            title: type,
            content: content,
            team: team,
            refs: options.metadata || {}
        });
        return;
    }

    const { error } = await db.from('timeline').insert([item]);

    if (error) console.error("Timeline Error:", error);
}

function subscribeToTimeline(callback) {
    if (!CURRENT_SESSION_ID || !isSupabaseAvailable) return;
    db.channel(`timeline:${CURRENT_SESSION_ID}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'timeline', filter: `session_id=eq.${CURRENT_SESSION_ID}` },
            (payload) => callback(payload.new)
        )
        .subscribe();
}

// Notetaker Data
async function saveNotetakerData(move, data) {
    if (!CURRENT_SESSION_ID) return false;
    const state = await fetchGameState();
    const moveNum = move || state.move;

    const notetakerData = {
        session_id: CURRENT_SESSION_ID,
        move: moveNum,
        phase: state.phase || 1,
        team: 'blue',
        client_id: CURRENT_CLIENT_ID,
        dynamics_analysis: data.dynamics_analysis || {},
        external_factors: data.external_factors || {},
        observation_timeline: data.observation_timeline || data.timelineItems || [],
        updated_at: new Date().toISOString()
    };

    if (!isSupabaseAvailable) {
        const key = `notes_session_${CURRENT_SESSION_ID}_move_${moveNum}`;
        return safeSetItem(key, notetakerData);
    }

    // MEDIUM-3: Use upsert to handle UNIQUE(session_id, move) constraint atomically
    // This prevents race conditions and handles the constraint properly
    const { error } = await db
        .from('notetaker_data')
        .upsert([notetakerData], {
            onConflict: 'session_id,move',
            ignoreDuplicates: false  // Update existing records
        });

    if (error) {
        console.error('Error saving notetaker data:', error);
        return false;
    }

    return true;
}

async function fetchNotetakerData(move = null) {
    if (!CURRENT_SESSION_ID) return null;

    const state = await fetchGameState();
    const moveNum = move || state.move || 1;

    if (!isSupabaseAvailable) {
        const key = `notes_session_${CURRENT_SESSION_ID}_move_${moveNum}`;
        const data = safeGetItem(key, null);
        if (data) {
            return {
                dynamics_analysis: data.dynamics_analysis || {},
                external_factors: data.external_factors || {},
                observation_timeline: data.observation_timeline || data.timelineItems || []
            };
        }
        return null;
    }

    const { data, error } = await db.from('notetaker_data')
        .select('*')
        .eq('session_id', CURRENT_SESSION_ID)
        .eq('move', moveNum)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No rows returned - this is OK, return null
            return null;
        }
        console.error('Fetch notetaker data error:', error);
        return null;
    }

    if (!data) return null;

    return {
        dynamics_analysis: data.dynamics_analysis || {},
        external_factors: data.external_factors || {},
        observation_timeline: data.observation_timeline || []
    };
}

function subscribeToNotetakerData(callback) {
    if (!CURRENT_SESSION_ID || !isSupabaseAvailable) return;
    db.channel(`notetaker_data:${CURRENT_SESSION_ID}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'notetaker_data', filter: `session_id=eq.${CURRENT_SESSION_ID}` },
            (payload) => callback(payload)
        )
        .subscribe();
}

// Reports
async function saveReportVersion(type, formData) {
    if (!CURRENT_SESSION_ID) return;
    const state = await fetchGameState();

    const report = {
        session_id: CURRENT_SESSION_ID,
        move: state.move,
        phase: state.phase,
        author_role: 'notetaker',
        client_id: CURRENT_CLIENT_ID,
        report_type: type,
        data: formData
    };

    if (!isSupabaseAvailable) {
        const key = `reports_session_${CURRENT_SESSION_ID}_move_${state.move}`;
        const reports = safeGetItem(key, []);
        report.id = `report_${Date.now()}`;
        report.created_at = new Date().toISOString();
        reports.push(report);
        safeSetItem(key, reports);
        return;
    }

    await db.from('reports').insert([report]);
}

async function submitMoveCompletion(move, meta) {
    if (!CURRENT_SESSION_ID) return;

    const completion = {
        session_id: CURRENT_SESSION_ID,
        move: move,
        team: 'blue',
        submitted_at: new Date().toISOString(),
        final_action_count: meta.actionCount,
        final_timeline_count: meta.timelineCount,
        submitted_by_role: 'notetaker',
        client_id: CURRENT_CLIENT_ID
    };

    if (!isSupabaseAvailable) {
        const key = `move_completions_session_${CURRENT_SESSION_ID}`;
        const completions = safeGetItem(key, []);
        completion.id = `completion_${Date.now()}`;
        completions.push(completion);
        safeSetItem(key, completions);
        await postTimelineItem('blue', 'admin', `Move ${move} Officially Submitted by Blue Team`);
        return;
    }

    await db.from('move_completions').insert([completion]);
    await postTimelineItem('blue', 'admin', `Move ${move} Officially Submitted by Blue Team`);
}

// ==========================================
// 9. DATA EXPORT FUNCTIONS (HIGH-1)
// ==========================================

/**
 * Gather all simulation data for export
 * @param {string} sessionId - Optional session ID (defaults to current session)
 * @returns {Object|null} Complete simulation data or null if unavailable
 */
async function gatherSimulationData(sessionId = null) {
    const targetSessionId = sessionId || CURRENT_SESSION_ID;
    if (!targetSessionId) {
        console.error('No session ID provided for data export');
        showToast('No session selected for export', 3000);
        return null;
    }

    try {
        if (!isSupabaseAvailable) {
            // LocalStorage mode - gather from localStorage
            const data = {
                session: {
                    id: targetSessionId,
                    name: sessionStorage.getItem('esg_session_name') || 'Local Session',
                    exported_at: new Date().toISOString()
                },
                gameState: safeGetItem(`game_state_${targetSessionId}`, {}),
                actions: [],
                requests: [],
                communications: [],
                timeline: [],
                notetakerData: [],
                participants: []
            };

            // Gather actions from all moves
            for (let move = 1; move <= 3; move++) {
                const actionsKey = `blueActions_session_${targetSessionId}_move_${move}`;
                const moveActions = safeGetItem(actionsKey, { actions: [] });
                if (moveActions.actions) {
                    data.actions.push(...moveActions.actions.filter(a => !a.is_deleted));
                }

                const requestsKey = `blueRequests_session_${targetSessionId}_move_${move}`;
                const moveRequests = safeGetItem(requestsKey, []);
                data.requests.push(...moveRequests.filter(r => r.status !== 'withdrawn'));

                const commsKey = `communications_session_${targetSessionId}_move_${move}`;
                const moveComms = safeGetItem(commsKey, []);
                data.communications.push(...moveComms);

                const timelineKey = `whiteCell_session_${targetSessionId}_move_${move}`;
                const moveTimeline = safeGetItem(timelineKey, {});
                if (moveTimeline.timelineItems) {
                    data.timeline.push(...moveTimeline.timelineItems);
                }

                const notesKey = `notes_session_${targetSessionId}_move_${move}`;
                const moveNotes = safeGetItem(notesKey, null);
                if (moveNotes) {
                    data.notetakerData.push({ move, ...moveNotes });
                }
            }

            return data;
        }

        // Supabase mode - fetch from database
        const [session, gameState, actions, requests, communications, timeline, notetakerData, participants] = await Promise.all([
            db.from('sessions').select('*').eq('id', targetSessionId).single(),
            db.from('game_state').select('*').eq('session_id', targetSessionId).single(),
            db.from('actions').select('*').eq('session_id', targetSessionId).eq('is_deleted', false).order('created_at'),
            db.from('requests').select('*').eq('session_id', targetSessionId).neq('status', 'withdrawn').order('created_at'),
            db.from('communications').select('*').eq('session_id', targetSessionId).order('created_at'),
            db.from('timeline').select('*').eq('session_id', targetSessionId).order('created_at'),
            db.from('notetaker_data').select('*').eq('session_id', targetSessionId).order('move'),
            db.from('session_participants').select('*, participants(*)').eq('session_id', targetSessionId)
        ]);

        return {
            session: session.data || { id: targetSessionId, name: 'Unknown Session' },
            gameState: gameState.data || {},
            actions: actions.data || [],
            requests: requests.data || [],
            communications: communications.data || [],
            timeline: timeline.data || [],
            notetakerData: notetakerData.data || [],
            participants: participants.data || [],
            exported_at: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error gathering simulation data:', error);
        showToast('Error gathering data for export', 3000);
        return null;
    }
}

/**
 * Export simulation data as JSON
 * @param {string} sessionId - Optional session ID
 */
async function exportJSON(sessionId = null) {
    const data = await gatherSimulationData(sessionId);
    if (!data) return;

    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        a.download = `esg-simulation-${data.session.name || sessionId || 'export'}-${timestamp}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('JSON export complete', 2500);
    } catch (error) {
        console.error('Error exporting JSON:', error);
        showToast('JSON export failed', 3000);
    }
}

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects
 * @returns {string} CSV string
 */
function convertToCSV(data) {
    if (!data || data.length === 0) return '';

    // Get all unique keys from all objects
    const keys = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));

    // Create header row
    const header = keys.join(',');

    // Create data rows
    const rows = data.map(obj => {
        return keys.map(key => {
            const value = obj[key];
            // Handle different data types
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

/**
 * Export simulation data as CSV (ZIP with multiple files)
 * @param {string} sessionId - Optional session ID
 */
async function exportCSV(sessionId = null) {
    const data = await gatherSimulationData(sessionId);
    if (!data) return;

    try {
        // Create CSV for each data type
        const csvFiles = {
            'actions.csv': convertToCSV(data.actions),
            'requests.csv': convertToCSV(data.requests),
            'communications.csv': convertToCSV(data.communications),
            'timeline.csv': convertToCSV(data.timeline),
            'notetaker_data.csv': convertToCSV(data.notetakerData),
            'participants.csv': convertToCSV(data.participants),
            'session_info.csv': convertToCSV([{
                ...data.session,
                ...data.gameState,
                exported_at: data.exported_at
            }])
        };

        // For now, download as individual CSV files
        // TODO: Implement ZIP functionality with JSZip library
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

        for (const [filename, content] of Object.entries(csvFiles)) {
            if (content) {
                const blob = new Blob([content], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${data.session.name || 'export'}-${timestamp}-${filename}`;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        }

        showToast('CSV export complete', 2500);
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showToast('CSV export failed', 3000);
    }
}

/**
 * Export simulation data as XLSX (Excel)
 * @param {string} sessionId - Optional session ID
 */
async function exportXLSX(sessionId = null) {
    const data = await gatherSimulationData(sessionId);
    if (!data) return;

    // Check if XLSX library is loaded
    if (typeof XLSX === 'undefined') {
        console.error('XLSX library not loaded. Please include SheetJS library.');
        showToast('XLSX library not available. Use JSON or CSV export instead.', 4000);
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // Add sheets for each data type
        if (data.actions.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.actions), 'Actions');
        }
        if (data.requests.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.requests), 'Requests');
        }
        if (data.communications.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.communications), 'Communications');
        }
        if (data.timeline.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.timeline), 'Timeline');
        }
        if (data.notetakerData.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.notetakerData), 'Notetaker Data');
        }
        if (data.participants.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.participants), 'Participants');
        }

        // Add session info sheet
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
            ...data.session,
            ...data.gameState,
            exported_at: data.exported_at
        }]), 'Session Info');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        XLSX.writeFile(wb, `esg-simulation-${data.session.name || sessionId || 'export'}-${timestamp}.xlsx`);

        showToast('XLSX export complete', 2500);
    } catch (error) {
        console.error('Error exporting XLSX:', error);
        showToast('XLSX export failed', 3000);
    }
}

/**
 * Export simulation data as PDF Summary
 * @param {string} sessionId - Optional session ID
 */
async function exportPDF(sessionId = null) {
    const data = await gatherSimulationData(sessionId);
    if (!data) return;

    if (typeof jspdf === 'undefined') {
        console.error('jspdf library not loaded');
        showToast('PDF library not available', 3000);
        return;
    }

    try {
        const { jsPDF } = jspdf;
        const doc = new jsPDF();

        // Title
        doc.setFontSize(22);
        doc.text("ESG Simulation Report", 105, 20, null, null, "center");

        doc.setFontSize(12);
        doc.text(`Session: ${data.session.name || 'Unknown'}`, 20, 40);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
        doc.text(`Generated By: ${CURRENT_CLIENT_ID || 'Unknown'}`, 20, 60);

        let y = 80;

        // Statistics
        doc.setFontSize(16);
        doc.text("Statistics", 20, y);
        y += 10;
        doc.setFontSize(12);
        doc.text(`Total Actions: ${data.actions.length}`, 30, y);
        y += 7;
        doc.text(`Total Requests: ${data.requests.length}`, 30, y);
        y += 7;
        doc.text(`Timeline Events: ${data.timeline.length}`, 30, y);
        y += 7;
        doc.text(`Communications: ${data.communications.length}`, 30, y);
        y += 15;

        // Actions Summary
        doc.setFontSize(16);
        doc.text("Recent Actions", 20, y);
        y += 10;
        doc.setFontSize(10);

        data.actions.slice(0, 10).forEach((action, i) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
            const status = action.status || 'draft';
            const text = `${i + 1}. [${action.team || 'Unknown'}] ${action.mechanism} - ${action.sector} (${status})`;
            doc.text(text, 30, y);
            y += 7;
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        doc.save(`esg-summary-${data.session.name || sessionId || 'export'}-${timestamp}.pdf`);

        showToast('PDF export complete', 2500);
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showToast('PDF export failed', 3000);
    }
}

/**
 * Export simulation data as ZIP Bundle
 * @param {string} sessionId - Optional session ID
 */
async function exportZIP(sessionId = null) {
    const data = await gatherSimulationData(sessionId);
    if (!data) return;

    if (typeof JSZip === 'undefined') {
        console.error('JSZip library not loaded');
        showToast('ZIP library not available', 3000);
        return;
    }

    try {
        const zip = new JSZip();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const folderName = `esg-${data.session.name ? data.session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'export'}-${timestamp}`;
        const folder = zip.folder(folderName);

        // Add JSON
        folder.file("full_data.json", JSON.stringify(data, null, 2));

        // Add CSVs
        folder.file("actions.csv", convertToCSV(data.actions));
        folder.file("requests.csv", convertToCSV(data.requests));
        folder.file("communications.csv", convertToCSV(data.communications));
        folder.file("timeline.csv", convertToCSV(data.timeline));
        folder.file("notetaker_data.csv", convertToCSV(data.notetakerData));
        folder.file("participants.csv", convertToCSV(data.participants));

        // Generate and download
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folderName}.zip`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('ZIP export complete', 2500);
    } catch (error) {
        console.error('Error exporting ZIP:', error);
        showToast('ZIP export failed', 3000);
    }
}

/**
 * Archive a session (soft delete/hide)
 * @param {string} sessionId
 */
async function archiveSession(sessionId) {
    if (!sessionId) return false;

    // Update session status to 'archived' in database or LocalStorage
    if (!isSupabaseAvailable) {
        // LocalStorage fallback
        const session = safeGetItem(`session_${sessionId}`);
        if (session) {
            session.status = 'archived';
            return safeSetItem(`session_${sessionId}`, session);
        }
        return false;
    }

    // Update in Supabase
    const { error } = await db.from('sessions')
        .update({ status: 'archived' })
        .eq('id', sessionId);

    if (error) {
        console.error('archiveSession error:', error);
        return false;
    }

    return true;
}

/**
 * Get a session by ID
 * @param {string} sessionId
 * @returns {Object|null} Session object or null if not found
 */
async function getSession(sessionId) {
    if (!sessionId) return null;

    // LocalStorage fallback
    if (!isSupabaseAvailable) {
        return safeGetItem(`session_${sessionId}`, null);
    }

    // Get from Supabase
    const { data, error } = await db.from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No rows returned - session not found
            return null;
        }
        console.error('getSession error:', error);
        return null;
    }

    return data;
}

/**
 * Helper to get a single action
 */
async function getAction(actionId) {
    if (!isSupabaseAvailable) {
        // LocalStorage fallback would scan all actions
        // Simplified for now
        return null;
    }
    const { data, error } = await db.from('actions').select('*').eq('id', actionId).single();
    if (error) {
        console.error('Error getting action:', error);
        return null;
    }
    return data;
}

/**
 * Helper to get a single request
 */
async function getRequest(requestId) {
    if (!isSupabaseAvailable) {
        return null;
    }
    const { data, error } = await db.from('requests').select('*').eq('id', requestId).single();
    if (error) {
        console.error('Error getting request:', error);
        return null;
    }
    return data;
}

/**
 * Helper for Notetaker Observation
 */
async function saveObservation(sessionId, move, observation) {
    if (!sessionId) return null;

    // Normalize observation structure
    const obs = {
        id: crypto.randomUUID(),
        type: observation.type || 'NOTE',
        content: observation.content || '',
        timestamp: new Date().toISOString(),
        phase: observation.phase || 1,
        faction_tag: observation.faction_tag || ''
    };

    // Get existing data to append
    const existingData = await fetchNotetakerData(sessionId, move);
    let currentObs = [];
    if (existingData && existingData.observation_timeline) {
        currentObs = Array.isArray(existingData.observation_timeline) ? existingData.observation_timeline : [];
    }

    currentObs.push(obs);

    return saveNotetakerData(sessionId, move, { observation_timeline: currentObs });
}

/**
 * Helper for Notetaker Dynamics
 */
async function saveDynamicsAnalysis(sessionId, move, dynamics) {
    return saveNotetakerData(sessionId, move, { dynamics_analysis: dynamics });
}

/**
 * Helper for Notetaker External Factors
 */
async function saveExternalFactors(sessionId, move, factors) {
    return saveNotetakerData(sessionId, move, { external_factors: factors });
}

/**
 * Create a generic communication
 */
async function createCommunication(commData) {
    if (!window.esg.isSupabaseAvailable()) return null;

    const { data, error } = await db.from('communications').insert([commData]).select().single();
    if (error) {
        console.error('Error creating communication:', error);
        return null;
    }
    return data;
}

// ==========================================
// 10. PUBLIC API
// ==========================================

window.esg = {
    // Connection & Mode
    testConnection,
    isSupabaseAvailable: () => isSupabaseAvailable,

    // Auth
    login,
    logout,
    checkAuth,

    // Role Management
    checkRoleAvailability,
    registerSessionParticipant,
    disconnectParticipant,
    disconnectExistingParticipants,
    ROLE_LIMITS,
    ROLE_DISPLAY_NAMES,
    HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_TIMEOUT_SECONDS,

    // Session Management
    createSession,
    fetchAllSessions,
    deleteSession,
    joinSession,
    getSessionMetadata,
    getSessionName,
    updateSessionMetadata,

    // Game State
    fetchGameState,
    updateGameState,
    subscribeToGameState,

    // Actions
    submitAction,
    updateAction,
    deleteAction,
    fetchActions,
    subscribeToActions,

    // Adjudication
    submitAdjudication,

    // Requests
    submitRequest,
    withdrawRequest,
    fetchRequests,
    subscribeToRequests,

    // Communications
    sendResponse,
    fetchCommunications,
    subscribeToCommunications,

    // Timeline
    fetchTimeline,
    postTimelineItem,
    subscribeToTimeline,

    // Notetaker Data
    saveNotetakerData,
    fetchNotetakerData,
    subscribeToNotetakerData,

    // Reports
    saveReportVersion,
    submitMoveCompletion,

    // Data Export (HIGH-1)
    gatherSimulationData,
    exportJSON,
    exportCSV,
    exportXLSX,
    exportPDF,
    exportZIP,

    // Additional Helpers
    archiveSession,
    getSession,
    getAction,
    getRequest,
    createCommunication,
    respondToRfi: sendResponse, // Alias
    createRequest: submitRequest, // Alias for consistency
    createAction: submitAction, // Alias - note: submitAction handles both creation and update usually? checks ID.

    // Notetaker Helpers
    saveObservation,
    saveDynamicsAnalysis,
    saveExternalFactors,

    // Communication
    createCommunication,

    // UI Utilities
    showToast,

    // Session Control
    setCurrentSession: function (sessionId) {
        CURRENT_SESSION_ID = sessionId;
        if (sessionId) {
            sessionStorage.setItem('esg_session_id', sessionId);
        }
    },

    // Getters
    getClientId: () => CURRENT_CLIENT_ID,
    getCurrentSessionId: () => CURRENT_SESSION_ID
};

// Export utilities to global scope
window.ENUMS = ENUMS;
window.CATEGORY_LABELS = CATEGORY_LABELS;
window.STORAGE_KEYS = STORAGE_KEYS;
window.toIsoNow = toIsoNow;
window.normalizePriority = normalizePriority;
window.mapCategoriesToLabels = mapCategoriesToLabels;
window.normalizeObservationType = normalizeObservationType;
window.isValidEnum = isValidEnum;
window.normalizeEnum = normalizeEnum;
window.makeActionId = makeActionId;
window.makeRequestId = makeRequestId;
window.formatForUi = formatForUi;
window.buildMoveKey = buildMoveKey;
window.readJSON = readJSON;
window.writeJSON = writeJSON;
window.mergeJSON = mergeJSON;
window.safeGetItem = safeGetItem;
window.safeSetItem = safeSetItem;
window.safeJSONParse = safeJSONParse;
window.validateData = validateData;
window.validateDataStrict = validateDataStrict;
window.withErrorHandling = withErrorHandling;
window.withErrorHandlingSync = withErrorHandlingSync;
window.deduplicateTimelineItems = deduplicateTimelineItems;
window.searchItems = searchItems;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;
window.migrateData = migrateData;
window.cleanupLegacyKeys = cleanupLegacyKeys;
window.appendTimelineItem = appendTimelineItem;
window.mapPhaseEnum = mapPhaseEnum;
window.getSessionId = getSessionId;
window.archiveSession = archiveSession;

console.log('ESG Data Layer initialized:', isSupabaseAvailable ? 'Supabase mode' : 'LocalStorage mode');
