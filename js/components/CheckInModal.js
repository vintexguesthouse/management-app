/**
 * js/components/CheckInModal.js
 * ─────────────────────────────────────────────────────
 * Slide-out panel component that handles:
 *
 * A) Available room  → Standard check-in form with:
 * - Guest name, nights, room type toggle
 * - Rate selector (1000–6500 KSH, step 100)
 * - Save button disabled until form is valid
 *
 * B) Occupied room   → Booking details + POS shop items
 * - Shows current guest info and running total
 * - Allows adding items: quantity × unit price → add_shop POST
 * - Check-out button → triggers receipt then check_out POST
 *
 * Exports:
 * - openModal(room, callbacks)
 * - closeModal()
 */

import { getState } from "../services/state.js";

// ─── ADD THIS LINE HERE ─────────────────────────────────
let _currentRoomTypeSelection = "Bed & Breakfast";


// ─────────────────────────────────────────────────────
// Shop menu
// ─────────────────────────────────────────────────────

const SHOP_ITEMS = [
  { name: "Water", price: 150 },
  { name: "Dasani 1L", price: 100 },
  { name: "Dasani 500ml", price: 50 },
  { name: "Soda", price: 50 },
  { name: "Predator Energy", price: 80 }
];

// ─────────────────────────────────────────────────────
// Rate range constants
// ─────────────────────────────────────────────────────

const RATE_MIN = 1000;
const RATE_MAX = 6500;
const RATE_STEP = 100;

// ─────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────

/** @param {number} n @returns {string} */
function _ksh(n) {
  if (n == null) return "—";
  return `KSH ${Number(n).toLocaleString("en-KE")}`;
}

/** @returns {string} — option HTML for rate dropdown */
function _buildRateOptions(baseRate) {
  let html = "";
  for (let r = RATE_MIN; r <= RATE_MAX; r += RATE_STEP) {
    const selected = r === baseRate ? "selected" : "";
    html += `<option value="${r}" ${selected}>${_ksh(r)}</option>`;
  }
  return html;
}

// ─────────────────────────────────────────────────────
// HTML Builders
// ─────────────────────────────────────────────────────

/**
 * Builds the check-in form HTML for an AVAILABLE room.
 * @param {Object} room
 * @returns {string}
 */
function _buildCheckInForm(room) {
  return `
    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-800">
      <div>
        <p class="text-xs text-gray-500 uppercase tracking-widest font-medium">Check-In</p>
        <h2 class="text-xl font-bold text-white mt-0.5">${room.room_name}</h2>
      </div>
      <button id="modal-close-btn" type="button"
        class="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-5 space-y-5">

      <div class="rounded-lg bg-gray-800/60 border border-gray-700 px-4 py-3 flex items-center justify-between">
        <div>
          <p class="text-xs text-gray-500">Room type</p>
          <p class="text-sm font-semibold text-white">${room.room_type}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-500">Base rate</p>
          <p class="text-sm font-bold text-emerald-400 font-mono">${_ksh(room.base_rate)}</p>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5" for="ci-guest-name">Guest Name</label>
        <input id="ci-guest-name" type="text" placeholder="Full name of guest"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
                 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5" for="ci-nights">Number of Nights</label>
        <input id="ci-nights" type="number" min="1" max="30" value="1"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
                 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5">Room Type</label>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" data-type="Bed &amp; Breakfast"
            class="room-type-btn py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors
                   ${room.room_type === "Bed & Breakfast" ? "bg-brand-700 border-brand-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"}">
            Bed &amp; Breakfast
          </button>
          <button type="button" data-type="Bed Only"
            class="room-type-btn py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors
                   ${room.room_type === "Bed Only" ? "bg-brand-700 border-brand-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"}">
            Bed Only
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5" for="ci-rate">
          Charged Rate
          <span class="text-gray-600 font-normal ml-1">(base: ${_ksh(room.base_rate)})</span>
        </label>
        <select id="ci-rate"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
                 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors">
          ${_buildRateOptions(room.base_rate)}
        </select>
        <!-- Variance Feedback Container -->
        <div id="ci-variance-container" class="mt-2 hidden">
          <p class="text-[10px] uppercase font-bold tracking-wider text-gray-500">
            Variance: <span id="ci-variance-value" class="text-white">0</span>
          </p>
        </div>
      </div>
      
      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5">Payment Status</label>
        <select
          id="ci-payment-status"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white">
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
        </select>
      </div>

    </div>

    <div class="px-5 py-4 border-t border-gray-800 space-y-2">
      <div id="ci-validation-msg" class="text-xs text-red-400 hidden mb-1"></div>
      <button id="btn-save-checkin" type="button"
        class="w-full py-2.5 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-500 text-white
               transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        Save Check-In
      </button>
      <button id="modal-cancel-btn" type="button"
        class="w-full py-2 rounded-xl font-medium text-sm text-gray-500 hover:text-gray-300 transition-colors">
        Cancel
      </button>
    </div>
  `;
}

/**
 * Builds the occupied-room detail panel with POS + checkout.
 * @param {Object} room
 * @returns {string}
 */
function _buildOccupiedPanel(room) {
  // Guest-specific details now live on the matched Airtable booking record
  // rather than directly on the room row. Fall back to an empty object so
  // a room that's flagged occupied but briefly missing activeBooking (e.g.
  // a stale poll) still renders instead of throwing.
  const booking = room.activeBooking ?? {};

  const shopItemsHtml = SHOP_ITEMS.map(
    (item) => `
    <div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <div>
        <p class="text-sm font-medium text-white">${item.name}</p>
        <p class="text-xs text-gray-500 font-mono">${_ksh(item.price)}</p>
      </div>
      <div class="flex items-center gap-2">
        <input type="number" min="1" max="99" value="1"
          data-item-name="${item.name}" data-item-price="${item.price}"
          class="shop-qty w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white
                 text-center focus:outline-none focus:border-brand-500 transition-colors" />
        <button type="button"
          data-item-name="${item.name}" data-item-price="${item.price}"
          class="btn-add-shop text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-brand-700 text-gray-300 hover:text-white
                 border border-gray-600 hover:border-brand-500 transition-colors font-medium">
          Add
        </button>
      </div>
    </div>
  `
  ).join("");

  const existingItems =
    Array.isArray(room.shop_items) && room.shop_items.length > 0
      ? room.shop_items
          .map(
            (si) => `
        <div class="flex justify-between text-xs py-0.5">
          <span class="text-gray-400">${si.name} ×${si.qty ?? 1}</span>
          <span class="text-gray-300 font-mono">${_ksh((si.unit_price ?? si.price ?? 0) * (si.qty ?? 1))}</span>
        </div>
      `
          )
          .join("")
      : `<p class="text-xs text-gray-600 italic">No shop items added yet.</p>`;

  return `
    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-800">
      <div>
        <p class="text-xs text-gray-500 uppercase tracking-widest font-medium">Occupied</p>
        <h2 class="text-xl font-bold text-white mt-0.5">${room.room_name}</h2>
      </div>
      <button id="modal-close-btn" type="button"
        class="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-5 space-y-5">

      <div class="rounded-lg bg-gray-800/60 border border-gray-700 px-4 py-3 space-y-1.5">
        <div class="flex justify-between">
          <span class="text-xs text-gray-500">Guest</span>
          <span class="text-sm font-semibold text-white">${booking.guest_name ?? "—"}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-gray-500">Check-in</span>
          <span class="text-xs text-gray-300 font-mono">${room.check_in ? new Date(room.check_in).toLocaleDateString("en-KE") : "—"}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-gray-500">Nights</span>
          <span class="text-xs text-gray-300 font-mono">${booking.nights ?? "—"}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-gray-500">Room rate</span>
          <span class="text-xs font-bold text-emerald-400 font-mono">${_ksh(room.charged_rate ?? room.base_rate)}</span>
        </div>
        <div class="flex justify-between border-t border-gray-700 pt-1.5 mt-1">
          <span class="text-xs text-gray-500">Room subtotal</span>
          <span class="text-sm font-bold text-white font-mono">
            ${_ksh((room.charged_rate ?? room.base_rate) * (booking.nights ?? 1))}
          </span>
        </div>
      </div>

      <div>
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Shop charges</p>
        <div id="existing-shop-items" class="space-y-0.5">
          ${existingItems}
        </div>
        <div class="flex justify-between mt-2 pt-2 border-t border-gray-800">
          <span class="text-xs text-gray-500">Shop total</span>
          <span id="shop-total-display" class="text-xs font-bold text-white font-mono">${_ksh(room.shop_total ?? 0)}</span>
        </div>
        <div class="flex justify-between mt-1">
          <span class="text-xs font-semibold text-gray-400">Grand total</span>
          <span id="grand-total-display" class="text-sm font-bold text-amber-300 font-mono">
            ${_ksh((room.charged_rate ?? room.base_rate) * (booking.nights ?? 1) + (room.shop_total ?? 0))}
          </span>
        </div>
      </div>

      <div>
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Add shop item</p>
        <div class="space-y-0">
          ${shopItemsHtml}
        </div>
      </div>

    </div>

    <div class="px-5 py-4 border-t border-gray-800 space-y-2">
      <button id="btn-checkout" type="button"
        class="w-full py-2.5 rounded-xl font-semibold text-sm bg-red-700 hover:bg-red-600 text-white transition-colors">
        Check Out &amp; Print Receipt
      </button>
      <button id="modal-cancel-btn" type="button"
        class="w-full py-2 rounded-xl font-medium text-sm text-gray-500 hover:text-gray-300 transition-colors">
        Close
      </button>
    </div>
  `;
}

// ─────────────────────────────────────────────────────
// State for this component
// ─────────────────────────────────────────────────────

let _selectedRoomType = "";

// ─────────────────────────────────────────────────────
// Check-in form logic
// ─────────────────────────────────────────────────────

/**
 * Wires up all interactive behaviour for the check-in form.
 * @param {Object}   room
 * @param {Function} onSave    - Called with the validated form data.
 * @param {boolean}  ownerMode - True if the active role is owner (bypasses leniency requirements).
 */
function _wireCheckInForm(room, onSave, ownerMode = false) {
  _selectedRoomType = room.room_type;

  const rateSelect = document.getElementById("ci-rate");
  const varianceContainer = document.getElementById("ci-variance-container");
  const varianceValue = document.getElementById("ci-variance-value");
  const saveBtn = document.getElementById("btn-save-checkin");
  const guestInput = document.getElementById("ci-guest-name");
  const nightsInput = document.getElementById("ci-nights");
  const validationMsg = document.getElementById("ci-validation-msg");
  const paymentSelect = document.getElementById("ci-payment-status");

  /** Evaluates form validity and en/disables the Save button */
  function _validate() {
    const hasGuest = guestInput.value.trim().length > 0;
    const hasNights = Number(nightsInput.value) >= 1;
    const valid = hasGuest && hasNights;
    
    saveBtn.disabled = !valid;

    if (!valid && (guestInput.value || nightsInput.value)) {
      validationMsg.textContent = !hasGuest ? "Guest name is required." : "Enter a valid number of nights.";
      validationMsg.classList.remove("hidden");
    } else {
      validationMsg.classList.add("hidden");
    }
  }

  // 1. Rate Variance Listener (Visual Feedback)
  rateSelect.addEventListener("change", (e) => {
    const selectedRate = Number(e.target.value);
    const variance = selectedRate - Number(room.base_rate);

    if (variance !== 0) {
      varianceContainer.classList.remove("hidden");
      varianceValue.textContent = `${variance > 0 ? "+" : ""}${variance} KSH`;
      varianceValue.className = variance > 0 ? "text-emerald-400" : "text-red-400";
    } else {
      varianceContainer.classList.add("hidden");
    }
    _validate();
  });

  // 2. Standard Input Listeners
  guestInput.addEventListener("input", _validate);
  nightsInput.addEventListener("input", _validate);

  // 3. Room type toggle logic (Keep your existing implementation here)
  document.querySelectorAll(".room-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      _selectedRoomType = btn.dataset.type;
      // ... (your existing class toggle code remains here)
    });
  });

  // 4. Final Save Event
  saveBtn.addEventListener("click", () => {
    const chargedRate = Number(rateSelect.value);
    const baseRate = Number(room.base_rate);
    
    onSave({
      room_name: room.room_name,
      guest_name: guestInput.value.trim(),
      nights: Number(nightsInput.value),
      room_type: _selectedRoomType,
      base_rate: baseRate,
      charged_rate: chargedRate,
      rate_variance: chargedRate - baseRate,
      shop_charge: 0, // Explicitly sending 0 instead of leaving it out
      grand_total: (chargedRate * Number(nightsInput.value)) + 0, // Adding the shop_charge here
      payment_status: paymentSelect.value,
      created_by: "system" // Or wherever you get your current user from
    });
  });

  // Set initial state
  saveBtn.disabled = true;
}

/**
 * Wires up POS and checkout for an occupied room.
 * @param {Object}   room
 * @param {Function} onAddShop   - Called with { item_name, item_price, quantity }.
 * @param {Function} onCheckOut  - Called when checkout button clicked.
 */
function _wireOccupiedPanel(room, onAddShop, onCheckOut) {
  // Add shop item buttons
  document.querySelectorAll(".btn-add-shop").forEach((btn) => {
    btn.addEventListener("click", () => {
      const itemName = btn.dataset.itemName;
      const itemPrice = Number(btn.dataset.itemPrice);
      const qtyInput = document.querySelector(`.shop-qty[data-item-name="${itemName}"]`);
      const qty = Math.max(1, Number(qtyInput?.value ?? 1));

      onAddShop({ item_name: itemName, item_price: itemPrice, quantity: qty });
    });
  });

  // Checkout
  document.getElementById("btn-checkout")?.addEventListener("click", onCheckOut);
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/**
 * Opens the slide-out modal for a given room.
 *
 * @param {Object} room
 * @param {{
 * onCheckIn:  Function,   // (formData) => void — available rooms
 * onAddShop:  Function,   // ({ item_name, item_price, quantity }) => void
 * onCheckOut: Function,   // () => void
 * ownerMode:  boolean,    // Pass true to bypass explanation logs for lower rates
 * }} callbacks
 */
export function openModal(room, { onCheckIn, onAddShop, onCheckOut, ownerMode }) {
  const modal = document.getElementById("checkin-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;

  const isOccupied = room.status === "occupied";

  // Inject HTML
  modal.innerHTML = isOccupied ? _buildOccupiedPanel(room) : _buildCheckInForm(room);

  // Wire interactivity
  if (isOccupied) {
    _wireOccupiedPanel(room, onAddShop, onCheckOut);
  } else {
    _wireCheckInForm(room, onCheckIn, ownerMode);
  }

  // Close buttons
  document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("modal-cancel-btn")?.addEventListener("click", closeModal);

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => {
      overlay.classList.replace("opacity-0", "opacity-100");
      modal.classList.remove("translate-x-full");
    });
  });

  // Clicking overlay closes modal
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };
}

/**
 * Closes the slide-out modal with animation.
 */
export function closeModal() {
  const modal = document.getElementById("checkin-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;

  modal.classList.add("translate-x-full");
  overlay.classList.replace("opacity-100", "opacity-0");

  setTimeout(() => {
    overlay.classList.add("hidden");
    modal.innerHTML = "";
  }, 300);
}

/**
 * Updates the shop totals displayed inside an already-open occupied panel.
 * Called after a successful add_shop POST.
 *
 * @param {Object} updatedRoom - The patched room from state.
 */
export function refreshOccupiedTotals(updatedRoom) {
  const nights = updatedRoom.activeBooking?.nights ?? 1;
  const roomRate = (updatedRoom.charged_rate ?? updatedRoom.base_rate) * nights;
  const shopTotal = updatedRoom.shop_total ?? 0;
  const grandTotal = roomRate + shopTotal;

  const shopEl = document.getElementById("shop-total-display");
  const grandEl = document.getElementById("grand-total-display");

  if (shopEl) shopEl.textContent = _ksh(shopTotal);
  if (grandEl) grandEl.textContent = _ksh(grandTotal);

  // Refresh shop items list
  const itemsEl = document.getElementById("existing-shop-items");
  if (itemsEl && Array.isArray(updatedRoom.shop_items)) {
    itemsEl.innerHTML =
      updatedRoom.shop_items.length > 0
        ? updatedRoom.shop_items
            .map(
              (si) => `
          <div class="flex justify-between text-xs py-0.5">
            <span class="text-gray-400">${si.name} ×${si.qty ?? 1}</span>
            <span class="text-gray-300 font-mono">${_ksh((si.unit_price ?? si.price ?? 0) * (si.qty ?? 1))}</span>
          </div>
        `
            )
            .join("")
        : `<p class="text-xs text-gray-600 italic">No shop items added yet.</p>`;
  }
}
