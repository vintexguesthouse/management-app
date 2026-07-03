/**
 * js/services/auth.js
 * ─────────────────────────────────────────────────────
 * Multi-user authentication module for Vintex Guest House.
 *
 * Credential map — PIN → { userId, role }
 * Credentials are kept in-module only; never exposed to
 * the DOM or stored in plain localStorage.
 *
 * Session persistence: sessionStorage (tab-scoped).
 * Keys:  vintex_authenticated  "true"
 *        vintex_user           e.g. "attendant_2"
 *        vintex_role           "attendant" | "owner"
 *
 * Exports:
 *   isAuthenticated()          → boolean
 *   getActiveUser()            → string | null
 *   getActiveRole()            → "attendant" | "owner" | null
 *   initAuthGate(callback)     → void
 */

// ─────────────────────────────────────────────────────
// Credential map
// ─────────────────────────────────────────────────────

/** @type {Map<string, { userId: string, role: 'attendant'|'owner' }>} */
const CREDENTIALS = new Map([
  ['vintex1',   { userId: 'attendant_1', role: 'attendant' }],
  ['john254', { userId: 'owner',       role: 'owner'     }],
]);

// ─────────────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────────────

/**
 * Returns true when a valid authenticated session exists
 * in sessionStorage for this browser tab.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return sessionStorage.getItem('vintex_authenticated') === 'true';
}

/**
 * Returns the active user ID (e.g. "attendant_2") or null
 * when no session is present.
 * @returns {string|null}
 */
export function getActiveUser() {
  return sessionStorage.getItem('vintex_user') ?? null;
}

/**
 * Returns the active role ("attendant" | "owner") or null
 * when no session is present.
 * @returns {'attendant'|'owner'|null}
 */
export function getActiveRole() {
  return /** @type {'attendant'|'owner'|null} */ (
    sessionStorage.getItem('vintex_role') ?? null
  );
}

/**
 * Writes session data into sessionStorage.
 * @param {string} userId
 * @param {'attendant'|'owner'} role
 */
function _writeSession(userId, role) {
  sessionStorage.setItem('vintex_authenticated', 'true');
  sessionStorage.setItem('vintex_user', userId);
  sessionStorage.setItem('vintex_role', role);
}

/**
 * Clears the active session from sessionStorage.
 * Can be called for a logout flow in the future.
 */
export function clearSession() {
  sessionStorage.removeItem('vintex_authenticated');
  sessionStorage.removeItem('vintex_user');
  sessionStorage.removeItem('vintex_role');
}

// ─────────────────────────────────────────────────────
// Auth gate bootstrapper
// ─────────────────────────────────────────────────────

/**
 * Boots the login screen gate. If the current tab already
 * has an authenticated session, the login screen is hidden
 * immediately and `onAuthenticatedCallback` fires.
 *
 * Otherwise, listens for form submission, validates the PIN
 * against the credential map, and on success:
 *   1. Persists the session to sessionStorage.
 *   2. Animates the login screen out.
 *   3. Updates the sidebar user pill with the active profile.
 *   4. Fires `onAuthenticatedCallback`.
 *
 * On failure: shows the inline error message, clears the
 * input, and re-focuses it — no browser popups.
 *
 * @param {Function} onAuthenticatedCallback - Called once auth passes.
 */
export function initAuthGate(onAuthenticatedCallback) {
  const loginScreen = document.getElementById('login-screen');
  const loginForm   = document.getElementById('login-form');
  const pinInput    = document.getElementById('login-pin-input');
  const errorMsg    = document.getElementById('login-error-msg');

  // ── Already authenticated in this tab ──
  if (isAuthenticated()) {
    _hideLoginScreen(loginScreen);
    _applySessionToUI();
    onAuthenticatedCallback();
    return;
  }

  // ── Wire form submission ──
  if (!loginForm) {
    console.error('[auth] #login-form not found in DOM.');
    return;
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const pin     = pinInput?.value?.trim() ?? '';
    const profile = CREDENTIALS.get(pin);

    if (profile) {
      // ✅ Valid PIN
      _writeSession(profile.userId, profile.role);

      if (errorMsg) errorMsg.classList.add('hidden');

      // Fade out login screen
      if (loginScreen) {
        loginScreen.classList.add('opacity-0');
        loginScreen.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          loginScreen.classList.add('hidden');
          loginScreen.classList.remove('opacity-0');
        }, 320);
      }

      _applySessionToUI();
      onAuthenticatedCallback();

    } else {
      // ❌ Invalid PIN
      if (errorMsg) errorMsg.classList.remove('hidden');
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
        // Brief shake animation via a CSS class
        pinInput.classList.add('shake-error');
        setTimeout(() => pinInput.classList.remove('shake-error'), 500);
      }
    }
  });
}

// ─────────────────────────────────────────────────────
// Internal UI helpers
// ─────────────────────────────────────────────────────

/**
 * Immediately hides the login overlay without animation.
 * Used when the session is already valid.
 * @param {HTMLElement|null} loginScreen
 */
function _hideLoginScreen(loginScreen) {
  if (loginScreen) loginScreen.classList.add('hidden');
}

/**
 * Injects the active user's profile into the sidebar
 * user pill and role badge, if those elements exist.
 * Also updates the avatar initials.
 */
function _applySessionToUI() {
  const user = getActiveUser();
  const role = getActiveRole();
  if (!user || !role) return;

  // ── Avatar initials ──
  const avatarEl = document.getElementById('sidebar-avatar');
  if (avatarEl) {
    avatarEl.textContent = _initials(user);
  }

  // ── User display name ──
  const nameEl = document.getElementById('sidebar-user-name');
  if (nameEl) {
    nameEl.textContent = _displayName(user);
  }

  // ── Role badge ──
  const roleEl = document.getElementById('sidebar-user-role');
  if (roleEl) {
    roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    roleEl.className = role === 'owner'
      ? 'text-xs font-semibold text-amber-400'
      : 'text-xs text-gray-500';
  }

  // ── Role-specific nav visibility ──
  // Owner gets extra management controls; attendants see standard nav.
  const ownerOnlyEls = document.querySelectorAll('[data-owner-only]');
  ownerOnlyEls.forEach(el => {
    if (role === 'owner') {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

/**
 * Builds a 2-letter avatar string from a user ID.
 * "attendant_2" → "A2",  "owner" → "OW"
 * @param {string} userId
 * @returns {string}
 */
function _initials(userId) {
  if (userId === 'owner') return 'OW';
  return 'AT'; // 'AT' for Attendant
}

/**
 * Builds a human-readable display name from a user ID.
 * "attendant_2" → "Attendant 2",  "owner" → "Owner"
 * @param {string} userId
 * @returns {string}
 */
function _displayName(userId) {
  if (userId === 'owner') return 'Owner';
  return 'Attendant';
}
