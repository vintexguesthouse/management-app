/**
 * js/components/BookingHistory.js
 * ─────────────────────────────────────────────────────
 * Renders a searchable, responsive table of past bookings
 * (is_active: false) for the owner-only History view.
 *
 * IMPORTANT: #history-container in index.html is a <tbody>
 * nested inside a table that already owns its <thead>
 * (Guest / Room / Check-in / Check-out / Amount / Status / Actions).
 * A <tbody> can only legally contain <tr> elements — setting its
 * .innerHTML to a <div> toolbar or a nested <table> gets silently
 * stripped/mangled by the browser's HTML parser. So this component
 * ONLY ever writes <tr> strings into #history-container. The search
 * input and result-count badge live in index.html itself
 * (#history-search-input / #history-total-badge) and are wired up
 * here rather than injected.
 *
 * Exports:
 * - renderBookingHistory(bookings) → injects <tr> rows into
 *   #history-container and wires up real-time filtering against
 *   the existing #history-search-input.
 */

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function _ksh(n) {
  if (n == null || isNaN(n)) return "—";
  return `KSH ${Number(n).toLocaleString("en-KE")}`;
}

function _fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Computes a checkout date from check_in + nights, since bookings
 * don't store an explicit checkout date (mirrors Receipt.js's
 * _calcDeparture()).
 */
function _calcCheckOut(iso, nights) {
  if (!iso) return "—";
  const d = new Date(iso);
  d.setDate(d.getDate() + (parseInt(nights, 10) || 1));
  return _fmtDate(d.toISOString());
}

function _paymentStatusBadge(status) {
  const map = {
    paid:    { label: "Paid",    cls: "bg-emerald-900/50 text-emerald-300 border-emerald-700/40" },
    partial: { label: "Partial", cls: "bg-amber-900/50 text-amber-300 border-amber-700/40" },
    unpaid:  { label: "Unpaid",  cls: "bg-red-900/50 text-red-300 border-red-700/40" }
  };
  const entry = map[status] ?? { label: status ?? "—", cls: "bg-gray-800 text-gray-400 border-gray-700" };
  return `<span class="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${entry.cls}">${entry.label}</span>`;
}

/**
 * Normalizes a raw booking record (from fetchBookings) into the
 * shape the table needs, tolerating slightly different field names
 * that may show up depending on how the booking was closed out.
 */
function _normalizeBooking(b) {
  const roomTotal = Number(b.charged_rate ?? 0) * Number(b.nights ?? 1);
  const shopTotal = Number(b.shop_charge ?? 0);
  const amountPaid = b.grand_total != null ? Number(b.grand_total) : roomTotal + shopTotal;

  return {
    id: b.airtable_id ?? b.id,
    check_in: b.check_in ?? null,
    nights: Number(b.nights ?? 1),
    sort_date: b.check_out ?? b.checked_out_at ?? b.updated_at ?? b.check_in ?? b.created_at ?? null,
    guest_name: b.guest_name ?? "—",
    room_name: b.room_name ?? "—",
    amount_paid: amountPaid,
    payment_status: b.payment_status ?? null,
    attendant: b.created_by ?? b.attendant ?? "—"
  };
}

// ─────────────────────────────────────────────────────
// HTML builders — <tr> only, this is going straight into a <tbody>
// ─────────────────────────────────────────────────────

function _buildRowHTML(row) {
  return `
    <tr class="bh-row border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors"
        data-guest="${(row.guest_name ?? "").toLowerCase()}"
        data-room="${(row.room_name ?? "").toLowerCase()}">
      <td class="px-5 py-3 text-sm text-white font-semibold whitespace-nowrap">${row.guest_name}</td>
      <td class="px-5 py-3 text-sm text-gray-300 whitespace-nowrap">${row.room_name}</td>
      <td class="px-5 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">${_fmtDate(row.check_in)}</td>
      <td class="px-5 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">${_calcCheckOut(row.check_in, row.nights)}</td>
      <td class="px-5 py-3 text-sm text-emerald-400 font-mono font-semibold whitespace-nowrap text-right">${_ksh(row.amount_paid)}</td>
      <td class="px-5 py-3 text-xs whitespace-nowrap text-right">${_paymentStatusBadge(row.payment_status)}</td>
      <td class="px-5 py-3 text-xs whitespace-nowrap text-right">
        <button type="button" data-action="delete-booking" data-booking-id="${row.id}"
          class="bh-delete-btn text-[10px] px-2 py-1 rounded-md border transition-colors font-medium
                 bg-gray-800 hover:bg-red-900/40 text-gray-500 hover:text-red-400 border-gray-700 hover:border-red-700">
          Delete
        </button>
      </td>
    </tr>
  `;
}

// ─────────────────────────────────────────────────────
// Search wiring — uses the existing #history-search-input in index.html
// ─────────────────────────────────────────────────────

function _wireSearch(total) {
  const input = document.getElementById("history-search-input");
  const badge = document.getElementById("history-total-badge");
  const emptyState = document.getElementById("history-empty-state");
  if (!input) return;

  // Reset any previous search text/listener state between renders.
  input.value = "";

  const handler = () => {
    const query = input.value.trim().toLowerCase();
    const rows = document.querySelectorAll(".bh-row");
    let visibleCount = 0;

    rows.forEach((row) => {
      const matches =
        query === "" ||
        row.dataset.guest.includes(query) ||
        row.dataset.room.includes(query);

      row.classList.toggle("hidden", !matches);
      if (matches) visibleCount += 1;
    });

    if (badge) {
      badge.textContent = `${visibleCount} of ${total} booking${total === 1 ? "" : "s"}`;
    }
    if (emptyState) {
      // Only show the "no bookings yet" empty state when there were never
      // any rows to begin with — a search with zero matches should just
      // show zero rows, not the "no history yet" illustration.
      emptyState.classList.toggle("hidden", total > 0);
    }
  };

  input.addEventListener("input", handler);
  handler();
}

// ─────────────────────────────────────────────────────
// Delete wiring
// ─────────────────────────────────────────────────────

/**
 * Delegated click handler for the "Delete" button on each row.
 * Uses an in-place two-tap confirm (button text flips to "Confirm?"
 * for ~3s, reverts if not tapped again) instead of window.confirm(),
 * to match the rest of the UI's destructive-action pattern.
 *
 * @param {Map<string, Object>} rowsById - normalized row lookup by id
 * @param {Function} onDelete - (row) => Promise<boolean>
 */
function _wireDeleteButtons(rowsById, onDelete) {
  const tbody = document.getElementById("history-container");
  if (!tbody || typeof onDelete !== "function") return;

  const pendingConfirm = new Set();

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest('[data-action="delete-booking"]');
    if (!btn) return;

    const id = btn.dataset.bookingId;
    const row = rowsById.get(id);
    if (!row) return;

    if (!pendingConfirm.has(id)) {
      pendingConfirm.add(id);
      btn.textContent = "Confirm?";
      btn.classList.add("bg-red-700", "border-red-500", "text-white");
      setTimeout(() => {
        if (pendingConfirm.has(id)) {
          pendingConfirm.delete(id);
          btn.textContent = "Delete";
          btn.classList.remove("bg-red-700", "border-red-500", "text-white");
        }
      }, 3000);
      return;
    }

    pendingConfirm.delete(id);
    btn.disabled = true;
    btn.textContent = "…";

    const success = await onDelete(row);
    if (!success) {
      btn.disabled = false;
      btn.textContent = "Delete";
      return;
    }

    const tr = btn.closest("tr");
    tr?.remove();

    const badge = document.getElementById("history-total-badge");
    const remaining = document.querySelectorAll(".bh-row").length;
    if (badge) badge.textContent = `${remaining} booking${remaining === 1 ? "" : "s"}`;

    const emptyState = document.getElementById("history-empty-state");
    if (emptyState) emptyState.classList.toggle("hidden", remaining > 0);
  });
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/**
 * Renders the booking history rows (past bookings only) into the
 * #history-container <tbody> and wires up the live search filter
 * against #history-search-input.
 *
 * @param {Array<Object>} bookings - Raw bookings from fetchBookings().
 *   Only records with is_active === false are shown.
 * @param {{ onDelete?: (row: Object) => Promise<boolean> }} [callbacks]
 *   onDelete is called with the normalized row ({ id, guest_name,
 *   room_name, ... }) after the second confirm tap, and should resolve
 *   true on success (removes the row from the table) or false on
 *   failure (reverts the button so the user can retry).
 */
export function renderBookingHistory(bookings, { onDelete } = {}) {
  const container = document.getElementById("history-container");
  if (!container) {
    console.error("[BookingHistory] #history-container not found in DOM.");
    return;
  }

  const pastBookings = (Array.isArray(bookings) ? bookings : [])
    .filter((b) => !b.is_active)
    .map(_normalizeBooking)
    .sort((a, b) => new Date(b.sort_date ?? 0) - new Date(a.sort_date ?? 0));

  // #history-container is a <tbody> — it may only contain <tr> elements,
  // so we write the row markup directly rather than wrapping it in any
  // toolbar/table markup (the table + thead already exist in index.html).
  container.innerHTML = pastBookings.map(_buildRowHTML).join("");

  const emptyState = document.getElementById("history-empty-state");
  if (emptyState) emptyState.classList.toggle("hidden", pastBookings.length > 0);

  _wireSearch(pastBookings.length);

  const rowsById = new Map(pastBookings.map((r) => [String(r.id), r]));
  _wireDeleteButtons(rowsById, onDelete);
}
