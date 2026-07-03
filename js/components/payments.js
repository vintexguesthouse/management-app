/**
 * js/components/payments.js
 * ─────────────────────────────────────────────────────
 * Centralized payment-method UI + validation, shared by
 * any component that needs to collect a payment method
 * and (when required) a reference number — e.g. CheckOutModal.js.
 *
 * Exports:
 * - renderPaymentFields(containerId, method)
 * - validatePayment(method, reference)
 *
 * Also exports the DOM id constants used by the rendered
 * markup so callers can read values back out without
 * duplicating magic strings.
 */

// ─────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank Transfer" }
];

// Label/placeholder shown for the conditional reference input, per method.
const REFERENCE_FIELD = {
  mpesa: { label: "M-Pesa Code", placeholder: "e.g. QFT3X9ZK1A" },
  bank_transfer: { label: "Bank Reference", placeholder: "e.g. FT23056789" }
};

// Methods that require a reference number before checkout can proceed.
const METHODS_REQUIRING_REFERENCE = new Set(Object.keys(REFERENCE_FIELD));

export const PAYMENT_METHOD_SELECT_ID = "payment-method-select";
export const PAYMENT_REFERENCE_WRAP_ID = "payment-reference-wrap";
export const PAYMENT_REFERENCE_LABEL_ID = "payment-reference-label";
export const PAYMENT_REFERENCE_INPUT_ID = "payment-reference-input";

function _requiresReference(method) {
  return METHODS_REQUIRING_REFERENCE.has(method);
}

// ─────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────

/**
 * Injects a payment method dropdown into `containerId`, plus a
 * conditional reference input ("M-Pesa Code" / "Bank Reference")
 * that shows automatically for methods that need one. Wires its
 * own change listener so the conditional field stays in sync
 * without any extra work from the caller.
 *
 * @param {string} containerId - id of the element to inject markup into
 * @param {string} [method="cash"] - initially selected payment method
 */
export function renderPaymentFields(containerId, method = "cash") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const optionsHtml = PAYMENT_METHODS.map(
    (m) => `<option value="${m.value}" ${m.value === method ? "selected" : ""}>${m.label}</option>`
  ).join("");

  const field = REFERENCE_FIELD[method];
  const hiddenClass = _requiresReference(method) ? "" : "hidden";

  container.innerHTML = `
    <label class="block text-xs font-semibold text-gray-400 mb-1.5" for="${PAYMENT_METHOD_SELECT_ID}">Payment Method</label>
    <select id="${PAYMENT_METHOD_SELECT_ID}"
      class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
             focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors">
      ${optionsHtml}
    </select>

    <div id="${PAYMENT_REFERENCE_WRAP_ID}" class="mt-3 ${hiddenClass}">
      <label id="${PAYMENT_REFERENCE_LABEL_ID}" class="block text-xs font-semibold text-gray-400 mb-1.5" for="${PAYMENT_REFERENCE_INPUT_ID}">${field?.label ?? ""}</label>
      <input id="${PAYMENT_REFERENCE_INPUT_ID}" type="text" placeholder="${field?.placeholder ?? ""}"
        class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white
               placeholder-gray-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
    </div>
  `;

  const select = document.getElementById(PAYMENT_METHOD_SELECT_ID);
  select.addEventListener("change", (e) => {
    const selected = e.target.value;
    const wrap = document.getElementById(PAYMENT_REFERENCE_WRAP_ID);
    const labelEl = document.getElementById(PAYMENT_REFERENCE_LABEL_ID);
    const input = document.getElementById(PAYMENT_REFERENCE_INPUT_ID);
    const selectedField = REFERENCE_FIELD[selected];

    wrap.classList.toggle("hidden", !_requiresReference(selected));
    labelEl.textContent = selectedField?.label ?? "";
    input.placeholder = selectedField?.placeholder ?? "";
    input.value = "";
  });
}

// ─────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────

/**
 * Validates a payment method + reference combination.
 * Cash needs no reference; M-Pesa and Bank Transfer both
 * require a non-empty reference value.
 *
 * @param {string} method - "cash" | "mpesa" | "bank_transfer"
 * @param {string} reference - the M-Pesa code / bank reference value (if applicable)
 * @returns {{ valid: boolean, message: string }}
 */
export function validatePayment(method, reference) {
  if (!method) {
    return { valid: false, message: "Select a payment method to continue." };
  }

  if (_requiresReference(method)) {
    const ref = (reference ?? "").trim();
    if (!ref) {
      const label = REFERENCE_FIELD[method]?.label ?? "reference number";
      return { valid: false, message: `Enter the ${label} to continue.` };
    }
  }

  return { valid: true, message: "" };
}
