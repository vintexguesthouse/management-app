/**
 * js/components/BookingHistory.js
 * ─────────────────────────────────────────────────────
 * Renders a searchable, responsive table of past bookings
 * (is_active: false) for the owner-only History view.
 *
 * Exports:
 * - renderBookingHistory(bookings) → injects table + search bar into
 *   #history-container and wires up real-time filtering.
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

function _paymentMethodLabel(method) {
  const labels = {
    cash: "Cash",
    mpesa: "M-Pesa",
    bank_transfer: "Bank Transfer"
  };
  return labels[method] ?? method ?? "—";
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
    date: b.check_out ?? b.checked_out_at ?? b.updated_at ?? b.check_in ?? b.created_at ?? null,
    guest_name: b.guest_name ?? "—",
    room_name: b.room_name ?? "—",
    amount_paid: amountPaid,
    payment_method: b.payment_method ?? null,
    attendant: b.created_by ?? b.attendant ?? "—"
  };
}

// ─────────────────────────────────────────────────────
// HTML builders
// ─────────────────────────────────────────────────────

function _buildToolbarHTML(count) {
  return `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div class="relative w-full sm:max-w-xs">
        <svg class="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input id="bh-search" type="text" placeholder="Search by guest or room…"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white
                 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
      </div>
      <p id="bh-result-count" class="text-xs text-gray-500 shrink-0">${count} booking${count === 1 ? "" : "s"}</p>
    </div>
  `;
}

function _buildRowHTML(row) {
  return `
    <tr class="bh-row border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors"
        data-guest="${(row.guest_name ?? "").toLowerCase()}"
        data-room="${(row.room_name ?? "").toLowerCase()}">
      <td class="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">${_fmtDate(row.date)}</td>
      <td class="px-4 py-3 text-sm text-white font-medium">${row.guest_name}</td>
      <td class="px-4 py-3 text-sm text-gray-300">${row.room_name}</td>
      <td class="px-4 py-3 text-sm text-emerald-400 font-mono font-semibold whitespace-nowrap">${_ksh(row.amount_paid)}</td>
      <td class="px-4 py-3 text-xs">
        <span class="inline-block px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">
          ${_paymentMethodLabel(row.payment_method)}
        </span>
      </td>
      <td class="px-4 py-3 text-xs text-gray-500">${row.attendant}</td>
    </tr>
  `;
}

function _buildTableHTML(rows) {
  if (rows.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <svg class="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0
               01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-sm text-gray-600">No completed bookings yet.</p>
      </div>`;
  }

  return `
    <div class="overflow-x-auto rounded-xl border border-gray-800">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-gray-900/80 border-b border-gray-800">
            <th class="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Date</th>
            <th class="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Guest Name</th>
            <th class="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Room</th>
            <th class="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Amount Paid</th>
            <th class="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Payment Method</th>
            <th class="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Attendant</th>
          </tr>
        </thead>
        <tbody id="bh-table-body">
          ${rows.map(_buildRowHTML).join("")}
        </tbody>
      </table>
    </div>
    <p id="bh-no-results" class="hidden text-center text-sm text-gray-600 py-10">No bookings match your search.</p>
  `;
}

// ─────────────────────────────────────────────────────
// Search wiring
// ─────────────────────────────────────────────────────

function _wireSearch() {
  const input = document.getElementById("bh-search");
  const resultCount = document.getElementById("bh-result-count");
  const noResults = document.getElementById("bh-no-results");
  if (!input) return;

  input.addEventListener("input", () => {
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

    if (resultCount) {
      resultCount.textContent = `${visibleCount} booking${visibleCount === 1 ? "" : "s"}`;
    }
    if (noResults) {
      noResults.classList.toggle("hidden", visibleCount > 0 || rows.length === 0);
    }
  });
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/**
 * Renders the booking history table (past bookings only) into
 * #history-container and wires up the live search filter.
 *
 * @param {Array<Object>} bookings - Raw bookings from fetchBookings().
 *   Only records with is_active === false are shown.
 */
export function renderBookingHistory(bookings) {
  const container = document.getElementById("history-container");
  if (!container) {
    console.error("[BookingHistory] #history-container not found in DOM.");
    return;
  }

  const pastBookings = (Array.isArray(bookings) ? bookings : [])
    .filter((b) => b.is_active === false)
    .map(_normalizeBooking)
    .sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0));

  container.innerHTML = _buildToolbarHTML(pastBookings.length) + _buildTableHTML(pastBookings);

  _wireSearch();
}