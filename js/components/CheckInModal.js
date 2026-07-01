/**
 * js/components/CheckInModal.js
 * ─────────────────────────────────────────────────────
 * Slide-out panel component that handles ONLY new guest
 * check-ins for an AVAILABLE room:
 * - Guest name, nights, room type toggle
 * - Rate selector (1000–6500 KSH, step 100)
 * - Save button disabled until form is valid
 *
 * Checkout, POS/shop items, and receipt printing now live
 * in CheckOutModal.js — this component no longer handles
 * occupied rooms at all.
 *
 * Exports:
 * - openModal(room, callbacks)
 * - closeModal()
 */

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
// HTML Builder
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
          <button type="button" data-type="Bed and Breakfast"
            class="room-type-btn py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors
                   ${room.room_type === "Bed and Breakfast" ? "bg-brand-700 border-brand-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"}">
            Bed and Breakfast
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
        class="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-brand-600 to-brand-500
               hover:from-brand-500 hover:to-brand-400
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

  // 3. Room type toggle logic
  document.querySelectorAll(".room-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      _selectedRoomType = btn.dataset.type;
      document.querySelectorAll(".room-type-btn").forEach((b) => {
        const active = b.dataset.type === _selectedRoomType;
        b.classList.toggle("bg-brand-700", active);
        b.classList.toggle("border-brand-500", active);
        b.classList.toggle("text-white", active);
        b.classList.toggle("bg-gray-800", !active);
        b.classList.toggle("border-gray-700", !active);
        b.classList.toggle("text-gray-400", !active);
      });
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
      shop_charge: 0,
      grand_total: chargedRate * Number(nightsInput.value),
      payment_status: paymentSelect.value,
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
 * Opens the slide-out modal for an AVAILABLE room only.
 *
 * @param {Object} room
 * @param {{
 *   onCheckIn: Function,   // (formData) => void
 *   ownerMode: boolean,    // Pass true to bypass explanation logs for lower rates
 * }} callbacks
 */
export function openModal(room, { onCheckIn, ownerMode }) {
  const modal = document.getElementById("checkin-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;

  // Inject HTML
  modal.innerHTML = _buildCheckInForm(room);

  // Wire interactivity
  _wireCheckInForm(room, onCheckIn, ownerMode);

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
