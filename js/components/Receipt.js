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
 * Builds the complete receipt HTML string.
 *
 * @param {Object} room - Room object from state (occupied, about to be checked out).
 * @returns {string}
 */
function _buildReceiptHTML(room) {
  const chargedRate = Number(room.charged_rate ?? room.base_rate);
  const nights      = Number(room.nights ?? 1);
  const departure = _calcDeparture(room.check_in, nights);
  const roomTotal   = chargedRate * nights;
  const shopTotal   = Number(room.shop_total ?? 0);
  const grandTotal  = roomTotal + shopTotal;
  const isDiscounted = chargedRate < Number(room.base_rate);

  // Fall back to activeBooking for these two — _mergeData() in main.js
  // sets payment_status at the top level on every poll, but doesn't
  // currently re-derive top-level payment_method after the first poll,
  // so activeBooking (which always reflects the raw Airtable record)
  // is the more reliable source once some time has passed since check-in.
  const paymentMethod = room.payment_method ?? room.activeBooking?.payment_method ?? null;
  const paymentStatus = room.payment_status ?? room.activeBooking?.payment_status ?? null;

  // ── Shop items rows ──
  const shopItemsHTML = Array.isArray(room.shop_items) && room.shop_items.length > 0
    ? room.shop_items.map(si => {
        const qty      = si.qty ?? 1;
        const price    = si.unit_price ?? si.price ?? 0;
        const lineTotal = price * qty;
        return `
          <div class="rct-item-line">
            <span>${si.name} x${qty}</span>
            <span class="font-mono">${_ksh(lineTotal)}</span>
          </div>`;
      }).join('')
    : `<div class="rct-item-line"><span style="color:#888;font-style:italic">None</span><span>—</span></div>`;

  // ── Discount note ──
  const discountHTML = isDiscounted ? `
    <div class="rct-discount-note">
      * Rate reduced from ${_ksh(room.base_rate)} (Director approved)
    </div>` : '';

  return `
<div class="receipt-wrapper">

  <!-- HEADER -->
  <div class="rct-header">
    <h2>VINTEX GUEST HOUSE</h2>
    <p>Kimana, Kajiado County, Kenya</p>
    <p>Tel: +254 700 000 000</p>
    <hr class="rct-divider" />
    <p><strong class="tracking-widest">OFFICIAL RECEIPT</strong></p>
    <p>No: ${_receiptNo()}</p>
    <p>Printed: ${_now()}</p>
  </div>

  <!-- GUEST INFO -->
  <p class="rct-section-label">Guest Details</p>
  <div class="rct-row"><span class="label">Name</span><span class="value font-semibold">${room.guest_name ?? '—'}</span></div>
  <div class="rct-row"><span class="label">Room</span><span class="value">${room.room_name}</span></div>
  <div class="rct-row"><span class="label">Type</span><span class="value">${room.room_type ?? '—'}</span></div>
  <div class="rct-row"><span class="label">Check-in</span><span class="value">${_fmtDate(room.check_in)}</span></div>
  <div class="rct-row"><span class="label">Check-out</span><span class="value">${departure}</span></div>
  <div class="rct-row"><span class="label">Nights</span><span class="value">${nights}</span></div>
  ${room.booking_id ? `<div class="rct-row"><span class="label">Booking ID</span><span class="value" style="font-size:7.5pt">${room.booking_id}</span></div>` : ''}

  <hr class="rct-divider" />

  <!-- ROOM CHARGES -->
  <p class="rct-section-label">Room Charges</p>
  <div class="rct-row">
    <span class="label">Rate / night</span>
    <span class="value font-mono">${_ksh(chargedRate)}</span>
  </div>
  <div class="rct-row">
    <span class="label">Nights</span>
    <span class="value">× ${nights}</span>
  </div>
  ${discountHTML}
  <div class="rct-row" style="font-weight:600">
    <span class="label">Room subtotal</span>
    <span class="value font-mono">${_ksh(roomTotal)}</span>
  </div>

  <hr class="rct-divider" />

  <!-- SHOP CHARGES -->
  <p class="rct-section-label">Shop / POS</p>
  ${shopItemsHTML}
  <div class="rct-row" style="font-weight:600;margin-top:3pt">
    <span class="label">Shop subtotal</span>
    <span class="value font-mono">${_ksh(shopTotal)}</span>
  </div>

  <hr class="rct-divider-solid" />

  <!-- GRAND TOTAL -->
  <div class="rct-total">
    <span class="tracking-widest">TOTAL DUE</span>
    <span class="font-mono">${_ksh(grandTotal)}</span>
  </div>

  <hr class="rct-divider" />

  <!-- PAYMENT NOTE -->
  <div class="rct-row" style="font-size:8pt">
    <span class="label">Payment method</span>
    <span class="value">${_paymentMethodLabel(paymentMethod)}</span>
  </div>
  <div class="rct-row" style="font-size:8pt">
    <span class="label">Status</span>
    <span class="value">${_paymentStatusLabel(paymentStatus)}</span>
  </div>

  <!-- FOOTER -->
  <div class="rct-footer">
    <p class="thank-you">Thank you for your stay!</p>
    <p>We hope to see you again soon.</p>
    <p style="margin-top:4pt;font-size:7pt;color:#777">
      This is a computer-generated receipt.<br/>
      Issued by Vintex Guest House PMS v1.0
    </p>
  </div>

</div>
  `.trim();
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
export function printReceipt(room) {
  const layer = document.getElementById('receipt-print-layer');
  if (!layer) {
    console.error('[Receipt] #receipt-print-layer not found in DOM.');
    return;
  }

  // Inject receipt HTML
  layer.innerHTML = _buildReceiptHTML(room);
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
