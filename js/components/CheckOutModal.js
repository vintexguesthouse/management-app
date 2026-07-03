/**
 * js/components/CheckOutModal.js
 * ─────────────────────────────────────────────────────
 * Slide-out panel component that handles financial closing
 * and check-out for an OCCUPIED room:
 * - Shows current guest info (pulled from room.activeBooking)
 * - Allows adding POS shop items: quantity × unit price → add_shop POST
 * - Payment Method selector (Cash / M-Pesa / Bank Transfer)
 *   with a conditional reference input (M-Pesa Code / Bank
 *   Reference), rendered via payments.js
 * - Download PDF / Print button → printReceipt()
 * - Check-out button → triggers checkOut() POST
 *
 * Reuses the same #checkin-modal / #modal-overlay DOM nodes
 * as CheckInModal.js — only one of the two modals is ever
 * open at a time, routed by room status in main.js.
 *
 * Payment method rendering + validation is centralized in
 * payments.js so every component that collects a payment
 * stays in sync (e.g. Bank Transfer requiring a reference,
 * same as M-Pesa).
 *
 * Exports:
 * - openModal(room, callbacks)
 * - closeModal()
 * - refreshOccupiedTotals(updatedRoom)
 */

import { printReceipt } from "./Receipt.js";
import {
  renderPaymentFields,
  validatePayment,
  PAYMENT_METHOD_SELECT_ID,
  PAYMENT_REFERENCE_INPUT_ID
} from "./payments.js";

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
// Internal helpers
// ─────────────────────────────────────────────────────

/** @param {number} n @returns {string} */
function _ksh(n) {
  if (n == null) return "—";
  return `KSH ${Number(n).toLocaleString("en-KE")}`;
}

// ─────────────────────────────────────────────────────
// HTML Builder
// ─────────────────────────────────────────────────────

/**
 * Builds the occupied-room detail panel with POS + checkout.
 * @param {Object} room
 * @returns {string}
 */
function _buildCheckOutPanel(room) {
  // Guest-specific details live on the matched Airtable booking record
  // rather than directly on the room row. Fall back to an empty object
  // so a room that's flagged occupied but briefly missing activeBooking
  // (e.g. a stale poll) still renders instead of throwing.
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

      <div>
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Payment</p>
        <div id="co-payment-fields"></div>
      </div>

    </div>

    <div class="px-5 py-4 border-t border-gray-800 space-y-2">
      <div id="co-validation-msg" class="text-xs text-red-400 hidden mb-1"></div>
      <button id="btn-print-receipt" type="button"
        class="w-full py-2.5 rounded-xl font-semibold text-sm bg-gray-700 hover:bg-gray-600 text-white transition-colors">
        Download PDF / Print Receipt
      </button>
      <button id="btn-checkout" type="button"
        class="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-red-700 to-red-600
               hover:from-red-600 hover:to-red-500 transition-colors">
        Check Out
      </button>
      <button id="modal-cancel-btn" type="button"
        class="w-full py-2 rounded-xl font-medium text-sm text-gray-500 hover:text-gray-300 transition-colors">
        Close
      </button>
    </div>
  `;
}

// ─────────────────────────────────────────────────────
// Wiring
// ─────────────────────────────────────────────────────

/**
 * Wires up POS, payment fields, printing and checkout for an occupied room.
 * @param {Object}   room
 * @param {Function} onAddShop   - Called with { item_name, item_price, quantity }.
 * @param {Function} onCheckOut  - Called with { payment_method, payment_reference } when checkout button clicked.
 */
function _wireCheckOutPanel(room, onAddShop, onCheckOut) {
  const paymentFieldsContainer = document.getElementById("co-payment-fields");
  const validationMsg = document.getElementById("co-validation-msg");

  // Render the shared payment method dropdown + conditional reference
  // field (M-Pesa Code / Bank Reference). payments.js wires its own
  // change listener to keep the reference field in sync.
  renderPaymentFields("co-payment-fields", "cash");

  // Clear any validation message once the person changes the method
  // or edits the reference value.
  paymentFieldsContainer.addEventListener("input", () => validationMsg.classList.add("hidden"));
  paymentFieldsContainer.addEventListener("change", () => validationMsg.classList.add("hidden"));

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

  // Download PDF / Print receipt — does not check the guest out, just prints
  document.getElementById("btn-print-receipt")?.addEventListener("click", () => {
    printReceipt(room);
  });

  // Checkout
  document.getElementById("btn-checkout")?.addEventListener("click", () => {
    const paymentMethod = document.getElementById(PAYMENT_METHOD_SELECT_ID).value;
    const referenceInput = document.getElementById(PAYMENT_REFERENCE_INPUT_ID);
    const reference = referenceInput ? referenceInput.value.trim() : "";

    const { valid, message } = validatePayment(paymentMethod, reference);

    if (!valid) {
      validationMsg.textContent = message;
      validationMsg.classList.remove("hidden");
      referenceInput?.focus();
      return;
    }

    validationMsg.classList.add("hidden");

    onCheckOut({
      payment_method: paymentMethod,
      payment_reference: reference || null
    });
  });
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/**
 * Opens the slide-out modal for an OCCUPIED room only.
 *
 * @param {Object} room
 * @param {{
 *   onAddShop:  Function,   // ({ item_name, item_price, quantity }) => void
 *   onCheckOut: Function,   // ({ payment_method, payment_reference }) => void
 * }} callbacks
 */
export function openModal(room, { onAddShop, onCheckOut }) {
  const modal = document.getElementById("checkin-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;

  // Inject HTML
  modal.innerHTML = _buildCheckOutPanel(room);

  // Wire interactivity
  _wireCheckOutPanel(room, onAddShop, onCheckOut);

  // Close buttons
  document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("modal-cancel-btn")?.addEventListener("click", closeModal);

  // Animate in
  overlay.classList.add("backdrop-blur-sm", "bg-black/50");
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
 * Updates the shop totals displayed inside an already-open checkout panel.
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
