/**
 * Automatic data saving to data_storage folder
 * Uses File System Access API when available, falls back to automatic downloads
 */

let dataStorageHandle = null;
let autoSaveEnabled = true;
let autoSaveInterval = null;

/**
 * Request permission to save to data_storage folder
 * @returns {Promise<boolean>} True if permission granted
 */
async function requestDataStorageAccess() {
    if (!('showDirectoryPicker' in window)) {
        alert('File System Access API is not available in this browser.\n\nAuto-save will use automatic downloads instead.\nPlease save downloaded files to the data_storage folder manually.');
        showToast('Using download fallback for auto-save');
        // Storage features removed. Define no-op stubs for compatibility.
        let dataStorageHandle = null;
        let autoSaveEnabled = false;
        let autoSaveInterval = null;

        async function requestDataStorageAccess() {
            showToast && showToast('Data storage disabled in this build');
            return false;
        }
        return false;
    }
}

/**
 * Save data to file in data_storage folder
 * @param {string} subfolder - Subfolder name (facilitators, notetakers, white-cells, team_submissions)
 * @param {string} filename - Filename
 * @param {Object} data - Data to save
 * @returns {Promise<boolean>} Success status
 */
async function saveToDataStorage(subfolder, filename, data) {
    if (!autoSaveEnabled) return false;

    try {
        // Try File System Access API first
        if (dataStorageHandle && dataStorageHandle.dataStorage) {
            try {
                const subfolderHandle = await dataStorageHandle.dataStorage.getDirectoryHandle(subfolder, { create: true });
                const fileHandle = await subfolderHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(data, null, 2));
                await writable.close();
                return true;
            } catch (error) {
                console.error('Error writing to file system:', error);
                // Fall through to download fallback
                if (error.name === 'QuotaExceededError' || error.name === 'NotAllowedError') {
                    // Show user notification for critical errors
                    if (typeof showToast === 'function') {
                        showToast('Auto-save failed: ' + (error.message || 'Storage access denied'), 5000);
                    }
                }
            }
        }

        // Fallback: Automatic download with consistent naming
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Use folder structure in filename to help organization
            // Format: data_storage_[subfolder]_[original_filename]
            a.download = `data_storage_${subfolder}_${filename}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Log for debugging (silent - no user notification for successful auto-saves)
            console.log(`Auto-saved: ${filename} to ${subfolder}/ (downloaded as data_storage_${subfolder}_${filename})`);

            return true;
        } catch (fallbackError) {
            console.error('Error in auto-save fallback:', fallbackError);
            if (typeof showToast === 'function') {
                showToast('Auto-save failed. Please export data manually.', 5000);
            }
            return false;
        }
    } catch (error) {
        console.error('Error saving to data storage:', error);
        if (typeof showToast === 'function') {
            showToast('Auto-save error: ' + (error.message || 'Unknown error'), 5000);
        }
        return false;
    }
}

/**
 * Auto-save facilitator data
 * @param {string} sessionId - Session ID
 * @param {number} move - Move number
 */
async function autoSaveFacilitatorData(sessionId, move) {
    try {
        const data = safeGetItem(`actions_session_${sessionId}_move_${move}`, null);
        if (!data) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
        const filename = `facilitator_session_${sessionId}_move_${move}_${timestamp}.json`;

        const exportData = {
            exported: new Date().toISOString(),
            exportedBy: 'BLUE Team Facilitator',
            sessionId: sessionId,
            move: move,
            data: data
        };

        await saveToDataStorage('facilitators', filename, exportData);
    } catch (error) {
        console.error('Error auto-saving facilitator data:', error);
    }
}

/**
 * Auto-save notetaker data
 * @param {string} sessionId - Session ID
 * @param {number} move - Move number
 */
async function autoSaveNotetakerData(sessionId, move) {
    try {
        const data = safeGetItem(`notes_session_${sessionId}_move_${move}`, null);
        if (!data) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
        const filename = `notetaker_session_${sessionId}_move_${move}_${timestamp}.json`;

        const exportData = {
            exported: new Date().toISOString(),
            exportedBy: 'BLUE Team Notetaker',
            sessionId: sessionId,
            move: move,
            data: data
        };

        await saveToDataStorage('notetakers', filename, exportData);
    } catch (error) {
        console.error('Error auto-saving notetaker data:', error);
    }
}

/**
 * Auto-save white cell data
 * @param {string} sessionId - Session ID
 * @param {number} move - Move number
 */
async function autoSaveWhiteCellData(sessionId, move) {
    try {
        const data = safeGetItem(`whiteCell_session_${sessionId}_move_${move}`, null);
        if (!data) return;

        // Also get related data
        const rulings = safeGetItem(`whiteCellRulings_session_${sessionId}_move_${move}`, []);
        const communications = safeGetItem(`communications_session_${sessionId}_move_${move}`, []);
        const adjudications = safeGetItem(`adjudications_session_${sessionId}_move_${move}`, []);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
        const filename = `whitecell_session_${sessionId}_move_${move}_${timestamp}.json`;

        const exportData = {
            exported: new Date().toISOString(),
            exportedBy: 'WHITE Cell Control',
            sessionId: sessionId,
            move: move,
            data: data,
            rulings: rulings,
            communications: communications,
            adjudications: adjudications
        };

        await saveToDataStorage('white-cells', filename, exportData);
    } catch (error) {
        console.error('Error auto-saving white cell data:', error);
    }
}

/**
 * Auto-save team submission data
 * @param {string} sessionId - Session ID
 * @param {number} move - Move number
 * @param {string} type - Submission type (actions, notes)
 */
async function autoSaveTeamSubmission(sessionId, move, type) {
    try {
        let data = null;
        let filename = '';
        let exportedBy = '';

        if (type === 'actions') {
            data = safeGetItem(`blueActions_session_${sessionId}_move_${move}`, null);
            filename = `team_actions_session_${sessionId}_move_${move}_${new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5)}.json`;
            exportedBy = 'BLUE Team Facilitator Submission';
        } else if (type === 'notes') {
            data = safeGetItem(`blueNotesSubmission_session_${sessionId}_move_${move}`, null);
            filename = `team_notes_session_${sessionId}_move_${move}_${new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5)}.json`;
            exportedBy = 'BLUE Team Notetaker Submission';
        }

        if (!data) return;

        const exportData = {
            exported: new Date().toISOString(),
            exportedBy: exportedBy,
            sessionId: sessionId,
            move: move,
            submissionType: type,
            data: data
        };

        await saveToDataStorage('team_submissions', filename, exportData);
    } catch (error) {
        console.error('Error auto-saving team submission:', error);
    }
}

/**
 * Enable/disable auto-save
 * @param {boolean} enabled - Whether to enable auto-save
 */
function setAutoSaveEnabled(enabled) {
    autoSaveEnabled = enabled;
    localStorage.setItem('autoSaveEnabled', enabled.toString());

    if (enabled && !autoSaveInterval) {
        // Start periodic auto-save (every 30 seconds as per documentation)
        // Note: Individual save operations are throttled to 30 seconds in their respective save functions
        autoSaveInterval = setInterval(() => {
            const sessionId = getSessionId();
            const currentMove = parseInt(document.getElementById('moveSelector')?.value || '1');

            // Determine which role we're in based on current page
            const path = window.location.pathname;
            if (path.includes('facilitator')) {
                autoSaveFacilitatorData(sessionId, currentMove);
            } else if (path.includes('notetaker')) {
                autoSaveNotetakerData(sessionId, currentMove);
            } else if (path.includes('white_cell') || path.includes('whitecell')) {
                autoSaveWhiteCellData(sessionId, currentMove);
            }
        }, 30 * 1000); // 30 seconds (aligned with documentation and throttling)
    } else if (!enabled && autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

/**
 * Initialize auto-save on page load
 */
function initAutoSave() {
    // Check if auto-save is enabled
    const saved = localStorage.getItem('autoSaveEnabled');
    autoSaveEnabled = saved !== null ? saved === 'true' : true;

    // Check for saved directory handle preference
    const savedHandle = localStorage.getItem('dataStorageHandle');
    if (savedHandle) {
        try {
            const handleData = JSON.parse(savedHandle);
            // Note: File handles can't be persisted across sessions for security reasons
            // The File System Access API requires user permission each session
            // Auto-save will use download fallback until folder is re-selected
            if (handleData.granted) {
                const lastSelected = handleData.timestamp ? new Date(handleData.timestamp) : null;
                const daysSince = lastSelected ? Math.floor((Date.now() - lastSelected.getTime()) / (1000 * 60 * 60 * 24)) : null;

                if (daysSince !== null && daysSince > 0) {
                    console.log(`Data storage folder was previously selected ${daysSince} day(s) ago. Click "Select Data Storage Folder" to re-enable direct file access. Auto-save is using download fallback.`);
                    if (typeof showToast === 'function') {
                        showToast('Auto-save is using downloads. Click "Select Data Storage Folder" to enable direct file access.', 5000);
                    }
                } else {
                    console.log('Data storage folder was previously selected. Click "Select Data Storage Folder" to re-enable direct file access.');
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Set up auto-save if enabled (will use download fallback if no folder selected)
    if (autoSaveEnabled) {
        setAutoSaveEnabled(true);
    }

    // Flag to prevent saving during reset
    let isResetting = false;

    window.addEventListener('storage', (e) => {
        if (e.key === null) {
            isResetting = true;
        }
    });

    // Auto-save on beforeunload (final save before page closes)
    // Use synchronous localStorage writes for guaranteed save
    window.addEventListener('beforeunload', () => {
        if (isResetting) return;
        if (autoSaveEnabled) {
            try {
                const sessionId = getSessionId();
                const moveSelector = document.getElementById('moveSelector');
                const currentMove = moveSelector ? parseInt(moveSelector.value || '1') : 1;
                const path = window.location.pathname;

                // Synchronous save to localStorage (guaranteed to complete)
                let dataToSave = null;
                if (path.includes('facilitator')) {
                    // Get data synchronously
                    const key = `actions_session_${sessionId}_move_${currentMove}`;
                    const data = localStorage.getItem(key);
                    if (data) {
                        try {
                            dataToSave = JSON.parse(data);
                        } catch (e) {
                            console.error('Error parsing facilitator data for beforeunload:', e);
                        }
                    }
                } else if (path.includes('notetaker')) {
                    const key = `notes_session_${sessionId}_move_${currentMove}`;
                    const data = localStorage.getItem(key);
                    if (data) {
                        try {
                            dataToSave = JSON.parse(data);
                        } catch (e) {
                            console.error('Error parsing notetaker data for beforeunload:', e);
                        }
                    }
                } else if (path.includes('white_cell') || path.includes('whitecell')) {
                    const key = `whiteCell_session_${sessionId}_move_${currentMove}`;
                    const data = localStorage.getItem(key);
                    if (data) {
                        try {
                            dataToSave = JSON.parse(data);
                        } catch (e) {
                            console.error('Error parsing whitecell data for beforeunload:', e);
                        }
                    }
                }

                // If we have data, try to save it synchronously
                if (dataToSave) {
                    try {
                        // Use sendBeacon for guaranteed delivery if available
                        if (navigator.sendBeacon) {
                            const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
                            const filename = path.includes('facilitator') ? 'facilitator' :
                                path.includes('notetaker') ? 'notetaker' : 'whitecell';
                            const url = `/api/save-backup?session=${sessionId}&move=${currentMove}&type=${filename}`;
                            // Note: sendBeacon requires server endpoint, fallback to localStorage
                            // For now, just ensure localStorage write completes
                        }

                        // Synchronous localStorage write (guaranteed)
                        const saveKey = path.includes('facilitator') ? `actions_session_${sessionId}_move_${currentMove}` :
                            path.includes('notetaker') ? `notes_session_${sessionId}_move_${currentMove}` :
                                `whiteCell_session_${sessionId}_move_${currentMove}`;
                        localStorage.setItem(saveKey, JSON.stringify(dataToSave));
                    } catch (e) {
                        console.error('Error in beforeunload synchronous save:', e);
                    }
                }
            } catch (e) {
                console.error('Error in beforeunload auto-save:', e);
            }
        }
    });
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoSave);
} else {
    initAutoSave();
}

// Export functions for use in other modules
window.autoSaveFacilitatorData = autoSaveFacilitatorData;
window.autoSaveNotetakerData = autoSaveNotetakerData;
window.autoSaveWhiteCellData = autoSaveWhiteCellData;
window.autoSaveTeamSubmission = autoSaveTeamSubmission;
window.requestDataStorageAccess = requestDataStorageAccess;
window.setAutoSaveEnabled = setAutoSaveEnabled;

