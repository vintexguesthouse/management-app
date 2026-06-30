/**
 * js/components/RoomCard.js
 * ─────────────────────────────────────────────────────
 * Renders a single room card for the dashboard grid.
 *
 * Visual rules:
 *  - Green ring + "Available" badge  → status === 'available'
 *  - Red   ring + "Occupied"  badge  → status === 'occupied'
 *
 * Exports:
 *  - renderRoomCard(room)  → HTMLElement
 *  - renderRoomsGrid(rooms, onCardClick) → void  (injects into #rooms-grid)
 */

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────

/** Maps room type string to a short display label. */
const ROOM_TYPE_LABELS = {
  'Bed & Breakfast': 'B&B',
  'Bed Only':        'Bed Only',
};

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

/**
 * Returns Tailwind classes for the card based on status.
 * @param {'available'|'occupied'} status
 * @returns {{ card: string, badge: string, ring: string, dot: string }}
 */
function _themeForStatus(status) {
  if (status === 'occupied') {
    return {
      card:  'border-red-700/60 hover:border-red-500',
      badge: 'bg-red-900/60 text-red-300 border border-red-700/50',
      ring:  'ring-red-600/30',
      dot:   'bg-red-400',
      rate:  'text-red-300',
    };
  }
  return {
    card:  'border-emerald-700/50 hover:border-emerald-500',
    badge: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40',
    ring:  'ring-emerald-600/30',
    dot:   'bg-emerald-400',
    rate:  'text-emerald-300',
  };
}

/**
 * Formats a KSH amount with comma separator.
 * @param {number|null|undefined} amount
 * @returns {string}
 */
function _ksh(amount) {
  if (amount == null) return '—';
  return `KSH ${Number(amount).toLocaleString('en-KE')}`;
}

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

/**
 * Creates and returns a room card DOM element.
 *
 * @param {{
 *   room_name:   string,
 *   room_type:   string,
 *   base_rate:   number,
 *   status:      'available'|'occupied',
 *   guest_name?: string,
 *   nights?:     number,
 *   check_in?:   string,
 * }} room
 * @returns {HTMLElement}
 */
export function renderRoomCard(room) {
  const theme     = _themeForStatus(room.status);
  const isOccupied = room.status === 'occupied';
  const typeLabel  = ROOM_TYPE_LABELS[room.room_type] ?? room.room_type;

  const card = document.createElement('button');
  card.type  = 'button';
  card.dataset.roomName = room.room_name;
  card.dataset.status   = room.status;
  card.setAttribute('aria-label', `${room.room_name} — ${room.status}`);

  card.className = [
    'room-card',
    'relative w-full text-left rounded-xl border bg-gray-900',
    'ring-2 p-4 cursor-pointer',
    'transition-colors duration-150',
    theme.card,
    theme.ring,
  ].join(' ');

  // ── Status dot ──
  const dotHtml = `
    <span class="absolute top-3 right-3 flex items-center gap-1.5">
      <span class="relative flex h-2 w-2">
        ${isOccupied ? '' : `<span class="animate-ping absolute inline-flex h-full w-full rounded-full ${theme.dot} opacity-60"></span>`}
        <span class="relative inline-flex rounded-full h-2 w-2 ${theme.dot}"></span>
      </span>
    </span>
  `;

  // ── Room name ──
  const nameHtml = `
    <p class="text-base font-semibold text-white mt-1 leading-tight">${room.room_name}</p>
  `;

  // ── Type pill ──
  const typePill = `
    <span class="inline-block text-xs px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-400 border border-gray-700 font-mono mt-1">
      ${typeLabel}
    </span>
  `;

  // ── Rate ──
  const rateHtml = `
    <p class="text-xs font-mono font-semibold mt-2 ${theme.rate}">${_ksh(room.base_rate)}</p>
  `;

  // ── Status badge ──
  const badgeHtml = `
    <span class="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mt-2 ${theme.badge}">
      ${isOccupied ? 'Occupied' : 'Available'}
    </span>
  `;

  // ── Guest info (occupied only) ──
  const guestHtml = isOccupied && room.guest_name ? `
    <div class="mt-2.5 pt-2.5 border-t border-gray-800">
      <p class="text-xs text-gray-500 truncate" title="${room.guest_name}">
        <span class="text-gray-600">Guest:</span> ${room.guest_name}
      </p>
      ${room.nights ? `<p class="text-xs text-gray-600 font-mono">${room.nights} night${room.nights !== 1 ? 's' : ''}</p>` : ''}
    </div>
  ` : '';

  card.innerHTML = `
    ${dotHtml}
    ${nameHtml}
    ${typePill}
    ${rateHtml}
    ${badgeHtml}
    ${guestHtml}
  `;

  return card;
}

// ─────────────────────────────────────────────────────
// Grid renderer
// ─────────────────────────────────────────────────────

/**
 * Clears and re-renders the entire #rooms-grid element.
 *
 * @param {Array}    rooms        - Array of room objects from state.
 * @param {Function} onCardClick  - Callback receiving the clicked room object.
 */
export function renderRoomsGrid(rooms, onCardClick) {
  const grid = document.getElementById('rooms-grid');
  if (!grid) return;

  // Clear existing content (removes loading skeleton too)
  grid.innerHTML = '';

  if (!rooms || rooms.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-24 gap-3">
        <svg class="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-sm text-gray-500">No rooms found. Check API connection.</p>
      </div>
    `;
    return;
  }

  for (const room of rooms) {
    const card = renderRoomCard(room);
    card.addEventListener('click', () => onCardClick(room));
    grid.appendChild(card);
  }
}
