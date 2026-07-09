/**
 * js/components/Receipt.js
 * ─────────────────────────────────────────────────────
 * Generates and prints a thermal-optimised receipt for
 * guest checkout. Targets 80mm roll paper via @page CSS.
 *
 * Exports:
 *  - printReceipt(room)  → injects HTML into #receipt-print-layer then calls window.print()
 */

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

/** @param {number|null} n @returns {string} */
function _ksh(n) {
  if (n == null || isNaN(n)) return 'KSH 0';
  return `KSH ${Number(n).toLocaleString('en-KE')}`;
}

/** @returns {string} formatted "DD MMM YYYY  HH:MM" */
function _now() {
  const d = new Date();
  return d.toLocaleString('en-KE', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** @param {string|null} iso @returns {string} */
function _fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * Maps a raw payment_method value to its display label. Mirrors the
 * labels used in payments.js / BookingHistory.js so the receipt says
 * the same thing the rest of the app does.
 * @param {string|null} method
 * @returns {string}
 */
function _paymentMethodLabel(method) {
  const labels = { cash: 'Cash', mpesa: 'M-Pesa', bank_transfer: 'Bank Transfer' };
  return labels[method] ?? method ?? '—';
}

/**
 * Maps a raw payment_status value to its display label.
 * @param {string|null} status
 * @returns {string}
 */
function _paymentStatusLabel(status) {
  if (status === 'paid') return 'PAID IN FULL';
  if (status === 'unpaid') return 'UNPAID';
  return '—';
}

/**
 * Generates a short human-readable receipt number.
 * Format: VGH-YYYYMMDD-XXXX
 */
function _receiptNo() {
  const d    = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VGH-${date}-${rand}`;
}

/** * Calculates departure date based on check-in date and nights 
 * @param {string} iso - ISO date string
 * @param {number} nights 
 */
function _calcDeparture(iso, nights) {
  if (!iso) return '—';
  const d = new Date(iso);
  d.setDate(d.getDate() + (parseInt(nights) || 1));
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}


// ─────────────────────────────────────────────────────
// Receipt HTML builder
// ─────────────────────────────────────────────────────

/**
 * Builds the complete receipt HTML string for one or multiple rooms.
 * @param {Array} rooms - Array of room objects (or a single room object).
 * @returns {string}
 */
function _buildConsolidatedReceipt(rooms) {
  // Ensure we are working with an array
  const roomList = Array.isArray(rooms) ? rooms : [rooms];
  
  // 1. Calculations
  const roomTotals = roomList.map(r => ({
    name: r.room_name,
    nights: Number(r.selected_nights ?? r.nights ?? 1),
    rate: Number(r.charged_rate ?? r.base_rate),
    base: Number(r.base_rate),
    total: Number(r.charged_rate ?? r.base_rate) * Number(r.selected_nights ?? r.nights ?? 1)
  }));

  const grandRoomTotal = roomTotals.reduce((sum, r) => sum + r.total, 0);
  const shopTotal = roomList.reduce((sum, r) => sum + Number(r.shop_total ?? 0), 0);
  const grandTotal = grandRoomTotal + shopTotal;

  // 2. Build Room Charges Section
  const roomChargesHTML = roomTotals.map(rt => `
    <div class="rct-row">
      <span class="label">${rt.name} (${rt.nights} nights)</span>
      <span class="value font-mono">${_ksh(rt.total)}</span>
    </div>
    ${rt.rate < rt.base ? `<div class="rct-discount-note">* ${rt.name} reduced from ${_ksh(rt.base)}</div>` : ''}
  `).join('');

  // 3. Aggregate Shop Items
  const allShopItems = roomList.flatMap(r => r.shop_items ?? []);
  const shopItemsHTML = allShopItems.length > 0 
    ? allShopItems.map(si => `
        <div class="rct-item-line">
          <span>${si.name} x${si.qty ?? 1}</span>
          <span class="font-mono">${_ksh((si.unit_price ?? si.price ?? 0) * (si.qty ?? 1))}</span>
        </div>`).join('')
    : `<div class="rct-item-line"><span style="color:#888;font-style:italic">None</span><span>—</span></div>`;

  // 4. Metadata (Taken from first room, as they share the booking)
  const first = roomList[0];
  const paymentMethod = first.payment_method ?? first.activeBooking?.payment_method ?? null;
  const paymentStatus = first.payment_status ?? first.activeBooking?.payment_status ?? null;
  const checkInIso = first.check_in ?? first.activeBooking?.check_in ?? null;
  const stayNights = Number(first.selected_nights ?? first.nights ?? first.activeBooking?.nights ?? 1);

  return `
<div class="receipt-wrapper">
  <div class="rct-header">
    <h2>VINTEX GUEST HOUSE</h2>
    <p>Kimana, Kajiado County, Kenya</p>
    <p>Tel: +254 700 000 000</p>
    <hr class="rct-divider" />
    <p><strong class="tracking-widest">OFFICIAL RECEIPT</strong></p>
    <p>No: ${_receiptNo()}</p>
    <p>Printed: ${_now()}</p>
  </div>

  <p class="rct-section-label">Guest Details</p>
  <div class="rct-row"><span class="label">Name</span><span class="value font-semibold">${first.guest_name ?? '—'}</span></div>
  <div class="rct-row"><span class="label">Check-in</span><span class="value">${_fmtDate(checkInIso)}</span></div>
  <div class="rct-row"><span class="label">Check-out</span><span class="value">${_calcDeparture(checkInIso, stayNights)}</span></div>
  ${roomList.map(r => `<div class="rct-row"><span class="label">Room</span><span class="value">${r.room_name}</span></div>`).join('')}
  
  <hr class="rct-divider" />

  <p class="rct-section-label">Room Charges</p>
  ${roomChargesHTML}
  <div class="rct-row" style="font-weight:600">
    <span class="label">Room subtotal</span>
    <span class="value font-mono">${_ksh(grandRoomTotal)}</span>
  </div>

  <hr class="rct-divider" />

  <p class="rct-section-label">Shop / POS</p>
  ${shopItemsHTML}
  <div class="rct-row" style="font-weight:600;margin-top:3pt">
    <span class="label">Shop subtotal</span>
    <span class="value font-mono">${_ksh(shopTotal)}</span>
  </div>

  <hr class="rct-divider-solid" />

  <div class="rct-total">
    <span class="tracking-widest">TOTAL DUE</span>
    <span class="font-mono">${_ksh(grandTotal)}</span>
  </div>

  <hr class="rct-divider" />

  <div class="rct-row" style="font-size:8pt">
    <span class="label">Payment method</span>
    <span class="value">${_paymentMethodLabel(paymentMethod)}</span>
  </div>
  <div class="rct-row" style="font-size:8pt">
    <span class="label">Status</span>
    <span class="value">${_paymentStatusLabel(paymentStatus)}</span>
  </div>

  <div class="rct-footer">
    <p class="thank-you">Thank you for your stay!</p>
    <p style="margin-top:4pt;font-size:7pt;color:#777">Issued by Vintex Guest House PMS v1.0</p>
  </div>
</div>`.trim();
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/**
 * Injects the receipt into #receipt-print-layer and
 * triggers the browser's native print dialog.
 *
 * The @media print CSS in style.css hides everything except
 * #receipt-print-layer so only the receipt is sent to the printer.
 *
 * After printing (or cancellation), the layer is hidden again.
 *
 * @param {Object} room - The room/booking data to print.
 */
export function printReceipt(rooms) {
  const layer = document.getElementById('receipt-print-layer');
  if (!layer) {
    console.error('[Receipt] #receipt-print-layer not found in DOM.');
    return;
  }

  // Inject receipt HTML
  layer.innerHTML = _buildConsolidatedReceipt(rooms);
  layer.classList.remove('hidden');

  // Small delay to ensure DOM paint before browser opens print dialog
  requestAnimationFrame(() => {
    setTimeout(() => {
      window.print();

      // Clean up after dialog closes (both print and cancel)
      const cleanup = () => {
        layer.innerHTML = '';
        layer.classList.add('hidden');
      };

      // afterprint fires on both confirm and cancel in modern browsers
      window.addEventListener('afterprint', cleanup, { once: true });
    }, 80);
  });
}
