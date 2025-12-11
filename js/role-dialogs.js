/**
 * role-dialogs.js - UI Dialogs for Role Management
 * 
 * Provides dialog components for role takeover and conflict resolution
 */

/**
 * Show dialog when role is full, offering takeover option
 * @param {string} roleName - Display name of the role
 * @param {Object} availability - Availability check result
 * @returns {Promise<string>} User's choice: 'cancel' or 'takeover'
 */
async function showRoleTakeoverDialog(roleName, availability) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'roleTakeoverOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.2s ease;
        `;

        const participantsList = availability.activeParticipants
            .map(p => `<li>${p.participants?.name || 'Anonymous'}</li>`)
            .join('');

        overlay.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                padding: 24px;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                font-family: 'Inter', sans-serif;
            ">
                <h2 style="margin: 0 0 16px; color: #1a4480; font-size: 1.25rem; font-weight: 600;">
                    Role Unavailable
                </h2>
                <p style="margin: 0 0 12px; color: #333; line-height: 1.6;">
                    The <strong>${roleName}</strong> role is currently full 
                    (${availability.current}/${availability.limit} active participants).
                </p>
                <div style="margin: 16px 0; padding: 12px; background: #f8f9fa; border-radius: 6px;">
                    <p style="margin: 0 0 8px; font-weight: 600; color: #1a4480; font-size: 0.9rem;">
                        Currently Active:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #666;">
                        ${participantsList}
                    </ul>
                </div>
                <p style="margin: 16px 0 24px; color: #666; font-size: 0.9rem; line-height: 1.5;">
                    You can wait for a slot to open, or request to take over (which will disconnect the current user).
                </p>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="btnCancel" style="
                        padding: 10px 20px;
                        border: 1px solid #ddd;
                        background: white;
                        color: #333;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.9rem;
                        font-weight: 500;
                        transition: all 0.2s;
                    ">
                        Cancel
                    </button>
                    <button id="btnTakeover" style="
                        padding: 10px 20px;
                        border: none;
                        background: #dc2626;
                        color: white;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 0.9rem;
                        font-weight: 500;
                        transition: all 0.2s;
                    ">
                        Take Over Role
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('btnCancel').onclick = () => {
            overlay.remove();
            resolve('cancel');
        };

        document.getElementById('btnTakeover').onclick = () => {
            overlay.remove();
            resolve('takeover');
        };

        // Add hover effects
        const btnCancel = document.getElementById('btnCancel');
        const btnTakeover = document.getElementById('btnTakeover');

        btnCancel.onmouseenter = () => btnCancel.style.background = '#f3f4f6';
        btnCancel.onmouseleave = () => btnCancel.style.background = 'white';

        btnTakeover.onmouseenter = () => btnTakeover.style.background = '#b91c1c';
        btnTakeover.onmouseleave = () => btnTakeover.style.background = '#dc2626';
    });
}

// Export to global scope
window.showRoleTakeoverDialog = showRoleTakeoverDialog;

console.log('Role dialogs initialized');
