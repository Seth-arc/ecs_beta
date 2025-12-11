/**
 * Modal Utilities - Styled confirmation and alert modals
 * Consistent with project design system
 */

// CSS Variables from project theme - matching team card styling
const MODAL_STYLES = {
    overlay: `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(2px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn 0.2s ease;
    `,
    modal: `
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(26, 68, 128, 0.04), 0 8px 32px rgba(26, 68, 128, 0.06);
        max-width: 500px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        position: relative;
    `,
    header: `
        padding: 24px 24px 16px;
        border-bottom: 1px solid #EDF2F7;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
    `,
    title: `
        font-size: 1.15rem;
        font-weight: 400;
        color: #1C2331;
        margin: 0;
        letter-spacing: -0.01em;
    `,
    body: `
        padding: 20px 24px;
        color: #4A5568;
        line-height: 1.6;
        font-size: 0.9375rem;
    `,
    footer: `
        padding: 16px 24px 24px;
        border-top: 1px solid #EDF2F7;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
    `,
    button: `
        padding: 12px 14px;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid transparent;
        display: inline-flex;
        align-items: center;
        gap: 8px;
    `,
    buttonPrimary: `
        background: #1a4480;
        color: white;
        border-color: #1a4480;
    `,
    buttonSecondary: `
        background: #FAFAFA;
        color: #1C2331;
        border-color: #EDF2F7;
    `,
    buttonDanger: `
        background: #8B1538;
        color: white;
        border-color: #8B1538;
    `,
    closeButton: `
        background: none;
        border: none;
        font-size: 24px;
        color: #718096;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    `
};

// Add keyframe animations
if (!document.getElementById('modal-animations')) {
    const style = document.createElement('style');
    style.id = 'modal-animations';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .modal-overlay {
            animation: fadeIn 0.2s ease;
        }
        .modal-content {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .modal-close-btn:hover {
            background: #F7F8FA;
            color: #1a4480;
        }
        .modal-btn-primary:hover {
            background: #0f2940;
            border-color: #0f2940;
            box-shadow: 0 1px 3px rgba(26, 68, 128, 0.06);
        }
        .modal-btn-secondary:hover {
            background: #FFFFFF;
            border-color: #1a4480;
            color: #1a4480;
            box-shadow: 0 1px 3px rgba(26, 68, 128, 0.06);
        }
        .modal-btn-danger:hover {
            background: #a62145;
            border-color: #a62145;
            box-shadow: 0 1px 3px rgba(139, 21, 56, 0.06);
        }
        .modal-content::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: #1a4480;
            border-radius: 12px 12px 0 0;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Show a styled confirmation modal
 * @param {string} message - The confirmation message
 * @param {string} title - Modal title (optional)
 * @param {Object} options - Options object
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
function showConfirmModal(message, title = 'Confirm Action', options = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = MODAL_STYLES.overlay;
        
        const confirmText = options.confirmText || 'Confirm';
        const cancelText = options.cancelText || 'Cancel';
        const type = options.type || 'default'; // 'default', 'danger'
        
        overlay.innerHTML = `
            <div class="modal-content" style="${MODAL_STYLES.modal}" onclick="event.stopPropagation()">
                <div style="${MODAL_STYLES.header}">
                    <h2 style="${MODAL_STYLES.title}">${title}</h2>
                    <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove(); window.__modalResolve(false);" style="${MODAL_STYLES.closeButton}">&times;</button>
                </div>
                <div style="${MODAL_STYLES.body}">
                    ${message.replace(/\n/g, '<br>')}
                </div>
                <div style="${MODAL_STYLES.footer}">
                    <button class="modal-btn-secondary" onclick="this.closest('.modal-overlay').remove(); window.__modalResolve(false);" style="${MODAL_STYLES.button} ${MODAL_STYLES.buttonSecondary}">
                        ${cancelText}
                    </button>
                    <button class="modal-btn-${type === 'danger' ? 'danger' : 'primary'}" onclick="this.closest('.modal-overlay').remove(); window.__modalResolve(true);" style="${MODAL_STYLES.button} ${type === 'danger' ? MODAL_STYLES.buttonDanger : MODAL_STYLES.buttonPrimary}">
                        ${confirmText}
                    </button>
                </div>
            </div>
        `;
        
        // Store resolve function globally so buttons can access it
        window.__modalResolve = resolve;
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
        
        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        document.body.appendChild(overlay);
        
        // Focus the confirm button
        setTimeout(() => {
            const confirmBtn = overlay.querySelector('.modal-btn-primary, .modal-btn-danger');
            if (confirmBtn) confirmBtn.focus();
        }, 100);
    });
}

/**
 * Show a styled alert modal
 * @param {string} message - The alert message
 * @param {string} title - Modal title (optional)
 * @param {Object} options - Options object
 * @returns {Promise<void>}
 */
function showAlertModal(message, title = 'Alert', options = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = MODAL_STYLES.overlay;
        
        const buttonText = options.buttonText || 'OK';
        
        overlay.innerHTML = `
            <div class="modal-content" style="${MODAL_STYLES.modal}" onclick="event.stopPropagation()">
                <div style="${MODAL_STYLES.header}">
                    <h2 style="${MODAL_STYLES.title}">${title}</h2>
                    <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove(); window.__modalResolve();" style="${MODAL_STYLES.closeButton}">&times;</button>
                </div>
                <div style="${MODAL_STYLES.body}">
                    ${message.replace(/\n/g, '<br>')}
                </div>
                <div style="${MODAL_STYLES.footer}">
                    <button class="modal-btn-primary" onclick="this.closest('.modal-overlay').remove(); window.__modalResolve();" style="${MODAL_STYLES.button} ${MODAL_STYLES.buttonPrimary}">
                        ${buttonText}
                    </button>
                </div>
            </div>
        `;
        
        // Store resolve function globally
        window.__modalResolve = resolve;
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve();
            }
        });
        
        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
                resolve();
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        document.body.appendChild(overlay);
        
        // Focus the OK button
        setTimeout(() => {
            const okBtn = overlay.querySelector('.modal-btn-primary');
            if (okBtn) okBtn.focus();
        }, 100);
    });
}

// Make functions globally available
window.showConfirmModal = showConfirmModal;
window.showAlertModal = showAlertModal;

