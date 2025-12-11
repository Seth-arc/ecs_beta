/**
 * Loading state management utilities
 * Provides consistent loading indicators across the application
 */

/**
 * Show loading overlay
 * @param {string} message - Optional loading message
 * @param {string} id - Optional element ID (default: 'loadingOverlay')
 */
function showLoading(message = 'Loading...', id = 'loadingOverlay') {
    let overlay = document.getElementById(id);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-message">${message}</div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    if (message) {
        const messageEl = overlay.querySelector('.loading-message');
        if (messageEl) messageEl.textContent = message;
    }
}

/**
 * Hide loading overlay
 * @param {string} id - Optional element ID (default: 'loadingOverlay')
 */
function hideLoading(id = 'loadingOverlay') {
    const overlay = document.getElementById(id);
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Show loading state for a specific element
 * @param {HTMLElement|string} element - Element or selector
 * @param {boolean} isLoading - Whether to show loading state
 */
function setElementLoading(element, isLoading) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;
    
    if (isLoading) {
        el.classList.add('loading');
        el.setAttribute('aria-busy', 'true');
        el.disabled = true;
    } else {
        el.classList.remove('loading');
        el.removeAttribute('aria-busy');
        el.disabled = false;
    }
}

/**
 * Create a loading button state
 * @param {HTMLElement|string} button - Button element or selector
 * @param {string} loadingText - Text to show while loading
 */
function setButtonLoading(button, loadingText = 'Loading...') {
    const btn = typeof button === 'string' ? document.querySelector(button) : button;
    if (!btn) return;
    
    const originalText = btn.textContent;
    const originalDisabled = btn.disabled;
    
    btn.dataset.originalText = originalText;
    btn.textContent = loadingText;
    btn.disabled = true;
    btn.classList.add('loading');
    
    return () => {
        btn.textContent = originalText;
        btn.disabled = originalDisabled;
        btn.classList.remove('loading');
    };
}

// Add CSS for loading states if not already present
if (!document.getElementById('loading-styles')) {
    const style = document.createElement('style');
    style.id = 'loading-styles';
    style.textContent = `
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
        }
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(26, 68, 128, 0.1);
            border-top-color: var(--color-navy, #1a4480);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        .loading-message {
            margin-top: 16px;
            font-size: 0.875rem;
            color: var(--color-text-secondary, #4A5568);
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .loading {
            opacity: 0.6;
            pointer-events: none;
            position: relative;
        }
        .loading::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 16px;
            height: 16px;
            margin: -8px 0 0 -8px;
            border: 2px solid rgba(26, 68, 128, 0.2);
            border-top-color: var(--color-navy, #1a4480);
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
        }
    `;
    document.head.appendChild(style);
}

