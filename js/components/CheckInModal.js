/**
 * js/components/CheckInModal.js
 * ─────────────────────────────────────────────────────
 * Slide-out panel component that handles new guest
 * check-ins for one OR MORE available rooms (group booking):
 * - Guest name + nights are shared across the whole group
 * - Each room in the group gets its own room-type toggle
 *   and rate selector, looped from the `rooms` array
 * - Payment (method + reference) is captured once for the
 *   whole group via the shared payments.js helpers
 * - Save button disabled until the shared fields are valid;
 *   payment is validated on submit, same pattern as CheckOutModal.js
 *
 * Checkout, POS/shop items, and receipt printing live in
 * CheckOutModal.js — this component only ever handles
 * available rooms.
 *
 * Exports:
 * - openModal(rooms, callbacks)
 * - closeModal()
 */

import {
  renderPaymentFields,
  validatePayment,
  PAYMENT_METHOD_SELECT_ID,
  PAYMENT_REFERENCE_INPUT_ID
} from "./payments.js";

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

/** Turns a room_name into a DOM-id-safe fragment. */
function _safeId(roomName) {
  return String(roomName).replace(/[^a-zA-Z0-9_-]/g, "_");
}

// ─────────────────────────────────────────────────────
// HTML Builder
// ─────────────────────────────────────────────────────

/**
 * Builds the per-room type-toggle + rate-selector block.
 * @param {Object} room
 * @returns {string}
 */
function _buildRoomBlock(room) {
  const id = _safeId(room.room_name);

  return `
    <div class="rounded-lg bg-gray-800/60 border border-gray-700 px-4 py-3 space-y-3" data-room="${room.room_name}">
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold text-white">${room.room_name}</p>
        <p class="text-xs text-gray-500">Base: ${_ksh(room.base_rate)}</p>
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5">Room Type</label>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" data-room="${room.room_name}" data-type="Bed and Breakfast"
            class="room-type-btn py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors
                   ${room.room_type === "Bed and Breakfast" ? "bg-brand-700 border-brand-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"}">
            Bed and Breakfast
          </button>
          <button type="button" data-room="${room.room_name}" data-type="Bed Only"
            class="room-type-btn py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors
                   ${room.room_type === "Bed Only" ? "bg-brand-700 border-brand-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"}">
            Bed Only
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5" for="ci-rate-${id}">
          Charged Rate
          <span class="text-gray-600 font-normal ml-1">(base: ${_ksh(room.base_rate)})</span>
        </label>
        <select id="ci-rate-${id}" data-room="${room.room_name}"
          class="ci-rate-select w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
                 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors">
          ${_buildRateOptions(room.base_rate)}
        </select>
        <div class="ci-variance-container mt-2 hidden" data-room="${room.room_name}">
          <p class="text-[10px] uppercase font-bold tracking-wider text-gray-500">
            Variance: <span class="ci-variance-value text-white">0</span>
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Builds the check-in form HTML for one or more AVAILABLE rooms.
 * @param {Object[]} rooms
 * @returns {string}
 */
function _buildCheckInForm(rooms) {
  const isGroup = rooms.length > 1;
  const roomBlocksHtml = rooms.map(_buildRoomBlock).join("");

  return `
    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-800">
      <div>
        <p class="text-xs text-gray-500 uppercase tracking-widest font-medium">${isGroup ? "Group Check-In" : "Check-In"}</p>
        <h2 class="text-xl font-bold text-white mt-0.5">${isGroup ? `${rooms.length} Rooms` : rooms[0].room_name}</h2>
      </div>
      <button id="modal-close-btn" type="button"
        class="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-5 space-y-5">

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5" for="ci-guest-name">
          Guest Name${isGroup ? " (whole group)" : ""}
        </label>
        <input id="ci-guest-name" type="text" placeholder="Full name of guest"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
                 placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-400 mb-1.5" for="ci-nights">
          Number of Nights${isGroup ? " (applies to all rooms)" : ""}
        </label>
        <input id="ci-nights" type="number" min="1" max="30" value="1"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
                 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
      </div>

      <div>
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
          ${isGroup ? "Rooms" : "Room Details"}
        </p>
        <div class="space-y-3">
          ${roomBlocksHtml}
        </div>
      </div>

      <div>
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
          ${isGroup ? "Group Payment" : "Payment"}
        </p>
        <div id="ci-payment-fields"></div>
      </div>

    </div>

    <div class="px-5 py-4 border-t border-gray-800 space-y-2">
      <div id="ci-validation-msg" class="text-xs text-red-400 hidden mb-1"></div>
      <button id="btn-save-checkin" type="button"
        class="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-brand-600 to-brand-500
               hover:from-brand-500 hover:to-brand-400
               transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        ${isGroup ? `Check In ${rooms.length} Rooms` : "Save Check-In"}
      </button>
      <button id="modal-cancel-btn" type="button"
        class="w-full py-2 rounded-xl font-medium text-sm text-gray-500 hover:text-gray-300 transition-colors">
        Cancel
      </button>
    </div>
  `;
}

// ─────────────────────────────────────────────────────
// Check-in form logic
// ─────────────────────────────────────────────────────

/**
 * Wires up all interactive behaviour for the check-in form.
 * @param {Object[]} rooms
 * @param {Function} onSave    - Called with the validated group form data.
 * @param {boolean}  ownerMode - True if the active role is owner (bypasses leniency requirements).
 */
function _wireCheckInForm(rooms, onSave, ownerMode = false) {
  // room_name -> currently selected room type
  const _roomTypeSelections = {};
  rooms.forEach((room) => {
    _roomTypeSelections[room.room_name] = room.room_type;
  });

  const saveBtn = document.getElementById("btn-save-checkin");
  const guestInput = document.getElementById("ci-guest-name");
  const nightsInput = document.getElementById("ci-nights");
  const validationMsg = document.getElementById("ci-validation-msg");
  const paymentFieldsContainer = document.getElementById("ci-payment-fields");

  /** Evaluates the shared-field validity and en/disables the Save button */
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

  // 1. Rate variance listeners (one per room)
  rooms.forEach((room) => {
    const rateSelect = document.getElementById(`ci-rate-${_safeId(room.room_name)}`);
    const varianceContainer = document.querySelector(`.ci-variance-container[data-room="${room.room_name}"]`);
    const varianceValue = varianceContainer?.querySelector(".ci-variance-value");

    rateSelect.addEventListener("change", (e) => {
      const selectedRate = Number(e.target.value);
      const variance = selectedRate - Number(room.base_rate);

      if (variance !== 0) {
        varianceContainer.classList.remove("hidden");
        varianceValue.textContent = `${variance > 0 ? "+" : ""}${variance} KSH`;
        varianceValue.className = `ci-variance-value ${variance > 0 ? "text-emerald-400" : "text-red-400"}`;
      } else {
        varianceContainer.classList.add("hidden");
      }
    });
  });

  // 2. Standard shared input listeners
  guestInput.addEventListener("input", _validate);
  nightsInput.addEventListener("input", _validate);

  // 3. Room type toggle logic, scoped per room
  rooms.forEach((room) => {
    document.querySelectorAll(`.room-type-btn[data-room="${room.room_name}"]`).forEach((btn) => {
      btn.addEventListener("click", () => {
        _roomTypeSelections[room.room_name] = btn.dataset.type;
        document.querySelectorAll(`.room-type-btn[data-room="${room.room_name}"]`).forEach((b) => {
          const active = b.dataset.type === _roomTypeSelections[room.room_name];
          b.classList.toggle("bg-brand-700", active);
          b.classList.toggle("border-brand-500", active);
          b.classList.toggle("text-white", active);
          b.classList.toggle("bg-gray-800", !active);
          b.classList.toggle("border-gray-700", !active);
          b.classList.toggle("text-gray-400", !active);
        });
      });
    });
  });

  // 4. Group payment fields (method + conditional reference)
  renderPaymentFields("ci-payment-fields", "cash");
  paymentFieldsContainer.addEventListener("input", () => validationMsg.classList.add("hidden"));
  paymentFieldsContainer.addEventListener("change", () => validationMsg.classList.add("hidden"));

  // 5. Final Save Event
  saveBtn.addEventListener("click", () => {
    const guestName = guestInput.value.trim();
    const nights = Number(nightsInput.value);

    const paymentMethod = document.getElementById(PAYMENT_METHOD_SELECT_ID)?.value ?? "cash";
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

    const roomsData = rooms.map((room) => {
      const roomType = _roomTypeSelections[room.room_name] ?? room.room_type;
      const rateSelect = document.getElementById(`ci-rate-${_safeId(room.room_name)}`);
      const chargedRate = Number(rateSelect.value);
      const baseRate = Number(room.base_rate);

      return {
        room_name: room.room_name,
        guest_name: guestName,
        nights,
        room_type: roomType,
        base_rate: baseRate,
        charged_rate: chargedRate,
        rate_variance: chargedRate - baseRate,
        grand_total: chargedRate * nights
      };
    });

    onSave({
      rooms: roomsData,
      payment_method: paymentMethod,
      payment_reference: reference || null,
      created_by: "system"
    });
  });

  // Set initial state
  saveBtn.disabled = true;
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/**
 * Opens the slide-out modal for one or more AVAILABLE rooms.
 * Pass a single-item array for a normal solo check-in, or a
 * multi-item array for a group booking.
 *
 * @param {Object[]} rooms
 * @param {{
 *   onCheckIn: Function,   // ({ rooms, payment_method, payment_reference, created_by }) => void
 *   ownerMode: boolean,    // Pass true to bypass explanation logs for lower rates
 * }} callbacks
 */
export function openModal(rooms, { onCheckIn, ownerMode }) {
  const modal = document.getElementById("checkin-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;
  if (!Array.isArray(rooms) || rooms.length === 0) return;

  // Inject HTML
  modal.innerHTML = _buildCheckInForm(rooms);

  // Wire interactivity
  _wireCheckInForm(rooms, onCheckIn, ownerMode);

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
