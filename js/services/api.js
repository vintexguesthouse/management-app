// api.js - FULLY MIGRATED TO AIRTABLE
const AIRTABLE_BASE_ID = "appy89xrqTChzanDq";
const AIRTABLE_TOKEN = "pat8QF6HLm4msqOmj.6d84422f5599d3d7245dc968b0c9925c1c72bb77ccf53dc9c60b2f1f37f245bf";
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

const getHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_TOKEN}`,
  "Content-Type": "application/json"
});

// Add this helper function at the top of api.js
function _logPayload(action, payload) {
  console.log(`%c[Vintex API] Outgoing Request: ${action}`, "color: #007bff; font-weight: bold;");
  console.log(JSON.stringify(payload, null, 2));
}

// This replaces your existing function at the top of api.js
// Make the function async
async function _handleError(err, response = null) {
  let message = err instanceof Error ? err.message : String(err ?? "Unknown error");

  if (response) {
    try {
      // Await the parsing to ensure it finishes before we continue
      const errorBody = await response.json();
      console.error("--- AIRTABLE ERROR DETAILS ---");
      console.error(JSON.stringify(errorBody, null, 2));
    } catch (e) {
      console.error("Could not parse error response:", e);
    }
  }

  console.error("[Vintex API]", message);
  return { ok: false, error: message };
}

// 1. FETCH ROOMS
export async function fetchRooms() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/rooms`, { method: "GET", headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return { ok: true, rooms: data.records.map((r) => ({ airtable_id: r.id, ...r.fields })) };
  } catch (err) {
    return _handleError(err);
  }
}

// 2. CHECK IN (POST to Airtable)
export async function checkIn(payload) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/bookings`, {
      method: "POST",
      headers: getHeaders(),
      // is_active: true is forced here (rather than relying on the caller
      // to set it) because _mergeData() in main.js depends on every freshly
      // created booking being flagged active the moment it lands in Airtable.
      body: JSON.stringify({ fields: { ...payload, is_active: true } })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    const data = await response.json();
    // Surface the new Airtable record id so the caller can store it as
    // room.booking_id immediately, without waiting for the next poll.
    return { ok: true, booking_id: data.id };
  } catch (err) {
    return _handleError(err);
  }
}

// ─────────────────────────────────────────────────────
// 2b. BULK CHECK IN (Batch POST to Airtable)
// ─────────────────────────────────────────────────────
//
// Used by the group check-in flow (CheckInModal_2.js) so a multi-room
// booking is written in as few round-trips as possible instead of
// firing N sequential checkIn() calls.
//
// Airtable's Batch API caps every request at 10 records, so groups
// larger than that are chunked and sent as sequential batches — the
// endpoint has no "batch of batches" mode, and firing all chunks in
// parallel risks tripping Airtable's per-base rate limit under real
// front-desk load (several receptionists checking in groups at once).
//
// Formula-driven fields (rate_variance, grand_total) are computed
// server-side by Airtable and must NOT be included in the write
// payload — depending on how the field is configured, sending a value
// for a formula column either gets silently ignored or throws
// INVALID_VALUE_FOR_COLUMN. We strip them defensively here rather than
// trusting every caller (modal code, future scripts, etc.) to remember.

const AIRTABLE_BATCH_LIMIT = 10;

/** Splits an array into chunks of at most `size` items. */
function _chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Strips Airtable formula fields out of a single record's field map.
 * @param {Object} data
 * @param {boolean} isPatch - false for a fresh check-in (forces is_active
 *   true), true for a checkout/patch (leaves is_active as given in `data`).
 */
function _sanitizeBookingFields(data, isPatch = false) {
  // 1. Define the exact columns that exist in your Airtable
  //    mpesa_code / bank_code are gone — payment_reference is now the
  //    single catch-all for any transaction reference, regardless of
  //    payment method.
  const writableFields = [
    "Client_Booking_Ref",
    "room_name",
    "guest_name",
    "nights",
    "check_in",
    "room_type",
    "base_rate",
    "charged_rate",
    "payment_status",
    "payment_method",
    "payment_reference",
    "amount_paid",
    "shop_charge", // Only if you input this manually
    "is_active",
    "created_by"
  ];

  // 2. Create a clean object using ONLY valid fields
  const clean = {};
  writableFields.forEach((key) => {
    if (data.hasOwnProperty(key)) clean[key] = data[key];
  });

  // Handle the "is_active" status explicitly
  if (!isPatch) {
    clean.is_active = true; // For check-in
  }

  return clean;
}

/**
 * Bulk-creates booking records for a group check-in.
 *
 * @param {Object[]} recordsArray - One field-map per room, e.g.
 *   { room_name, guest_name, nights, room_type, base_rate, charged_rate,
 *     payment_method, payment_reference, created_by, ... }
 *   Formula fields (rate_variance, grand_total) may be present or absent —
 *   they're stripped either way.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   booking_ids?: string[],      // Airtable record ids, in creation order
 *   partial?: boolean,           // true if some (but not all) batches failed
 *   failedBatches?: Object[],    // [{ batchIndex, rooms, error }]
 *   error?: string
 * }>}
 */
export async function bulkCheckIn(recordsArray) {
  if (!Array.isArray(recordsArray) || recordsArray.length === 0) {
    return { ok: false, error: "bulkCheckIn requires a non-empty array of booking records." };
  }

  const batches = _chunk(recordsArray, AIRTABLE_BATCH_LIMIT);
  const createdIds = [];
  const failedBatches = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const payload = {
      records: batch.map((record) => ({
        fields: _sanitizeBookingFields(record, false) // Always active for new
      }))
    };

    _logPayload(`POST /bookings (batch ${i + 1}/${batches.length})`, payload);

    try {
      const response = await fetch(`${AIRTABLE_URL}/bookings`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errResult = await _handleError(`HTTP ${response.status}: batch ${i + 1} failed`, response);
        failedBatches.push({
          batchIndex: i,
          rooms: batch.map((r) => r.room_name).filter(Boolean),
          error: errResult.error
        });
        continue; // One bad batch shouldn't sink rooms in the other batches.
      }

      const data = await response.json();
      data.records.forEach((r) => createdIds.push(r.id));
    } catch (err) {
      const errResult = await _handleError(err);
      failedBatches.push({
        batchIndex: i,
        rooms: batch.map((r) => r.room_name).filter(Boolean),
        error: errResult.error
      });
    }
  }

  if (failedBatches.length === 0) {
    return { ok: true, booking_ids: createdIds };
  }

  if (createdIds.length === 0) {
    return { ok: false, error: "All batches failed.", failedBatches };
  }

  // Partial success: some rooms are genuinely checked in on Airtable's
  // side. Surfacing both lets main.js patch state for the rooms that
  // succeeded and show a targeted retry/error for the ones that didn't,
  // instead of telling the front desk the whole group failed when most
  // of it actually went through.
  return { ok: true, partial: true, booking_ids: createdIds, failedBatches };
}

// 3. CHECK OUT (PATCH to Airtable)
export async function checkOut(airtableId, payload) {
  try {
    // Merge status into the payload before sanitizing. Only default to
    // "paid" when the caller didn't supply a payment_status — checkout
    // can now close a booking as unpaid/partial too.
    const dataToSave = {
      ...payload,
      is_active: false,
      payment_status: payload.payment_status ?? "paid"
    };

    const response = await fetch(`${AIRTABLE_URL}/bookings/${airtableId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ fields: _sanitizeBookingFields(dataToSave, true) })
    });

    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    return { ok: true };
  } catch (err) {
    return _handleError(err);
  }
}

// ─────────────────────────────────────────────────────
// 3b. BULK CHECK OUT (Batch PATCH to Airtable)
// ─────────────────────────────────────────────────────
//
// Mirrors bulkCheckIn()'s batching/rate-limit reasoning exactly, just
// on the update side: Airtable's batch-update endpoint accepts the
// same shape (PATCH with an array of records) and the same 10-record
// cap, so a group checkout is chunked and sent as sequential batches
// too — giving check-out the same resilience to partial Airtable
// failures that bulkCheckIn already gives check-in, instead of firing
// N individual PATCH requests and losing track of which ones landed.
//
// Every room in a group checkout writes the SAME payment fields
// (method / reference / status), so unlike bulkCheckIn there's no
// per-record field variation — just the shared `fields` object
// attached to each id.

/**
 * Bulk-closes booking records for a group checkout.
 *
 * @param {string[]} bookingIds - Airtable record ids to close.
 * @param {Object} payload - Shared fields for every record in the group,
 *   e.g. { payment_method, payment_reference, payment_status }.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   closed_ids?: string[],       // Airtable record ids that closed successfully
 *   partial?: boolean,           // true if some (but not all) batches failed
 *   failedBatches?: Object[],    // [{ batchIndex, bookingIds, error }]
 *   error?: string
 * }>}
 */
export async function bulkCheckOut(bookingIds, payload) {
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return { ok: false, error: "bulkCheckOut requires a non-empty array of booking ids." };
  }

  const dataToSave = {
    ...payload,
    is_active: false,
    payment_status: payload.payment_status ?? "paid"
  };
  const fields = _sanitizeBookingFields(dataToSave, true);

  const batches = _chunk(bookingIds, AIRTABLE_BATCH_LIMIT);
  const closedIds = [];
  const failedBatches = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const payloadBody = {
      records: batch.map((id) => ({ id, fields }))
    };

    _logPayload(`PATCH /bookings (checkout batch ${i + 1}/${batches.length})`, payloadBody);

    try {
      const response = await fetch(`${AIRTABLE_URL}/bookings`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(payloadBody)
      });

      if (!response.ok) {
        const errResult = await _handleError(`HTTP ${response.status}: batch ${i + 1} failed`, response);
        failedBatches.push({
          batchIndex: i,
          bookingIds: batch,
          error: errResult.error
        });
        continue; // One bad batch shouldn't sink rooms in the other batches.
      }

      const data = await response.json();
      data.records.forEach((r) => closedIds.push(r.id));
    } catch (err) {
      const errResult = await _handleError(err);
      failedBatches.push({
        batchIndex: i,
        bookingIds: batch,
        error: errResult.error
      });
    }
  }

  if (failedBatches.length === 0) {
    return { ok: true, closed_ids: closedIds };
  }

  if (closedIds.length === 0) {
    return { ok: false, error: "All checkout batches failed.", failedBatches };
  }

  return { ok: true, partial: true, closed_ids: closedIds, failedBatches };
}

// 4. FETCH BOOKINGS (the relational counterpart to fetchRooms)
export async function fetchBookings() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/bookings`, { method: "GET", headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return { ok: true, bookings: data.records.map((r) => ({ airtable_id: r.id, ...r.fields })) };
  } catch (err) {
    return _handleError(err);
  }
}

// ─────────────────────────────────────────────────────
// EXTEND BOOKING (PATCH nights to Airtable)
// ─────────────────────────────────────────────────────
//
// Backs the "Extend Stay" action in CheckOutModal.js — a lightweight,
// single-field PATCH so nights can be updated mid-checkout without
// going through the full _sanitizeBookingFields() checkout payload.

/**
 * Updates the `nights` field on a single booking record.
 *
 * @param {string} airtableId - the booking's Airtable record id
 * @param {number} nights - the new nights value
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function extendBooking(airtableId, nights) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/bookings/${airtableId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ fields: { nights: Number(nights) } })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    return { ok: true };
  } catch (err) {
    return _handleError(err);
  }
}

// 5. ADD SHOP ITEM (PATCH to Airtable)
// Left in place, UNUSED, as a rollback safety net — the app now writes
// shop charges as individual rows in the shop_line_items table via
// addShopLineItem() below instead of PATCHing a running total onto the
// booking record (that running-total approach was a race condition:
// two rapid "Add" clicks on the same item could read-then-write the
// same stale total and silently lose one of the updates).
export async function addShopItem(airtableId, payload) {
  try {
    // You will need to fetch the existing total first, then PATCH the update
    const response = await fetch(`${AIRTABLE_URL}/bookings/${airtableId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({
        fields: {
          shop_charge: payload.new_shop_total
        }
      })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    return { ok: true };
  } catch (err) {
    return _handleError(err);
  }
}

// ─────────────────────────────────────────────────────
// SHOP LINE ITEMS (shop_line_items table)
// ─────────────────────────────────────────────────────
//
// Each "Add" click on a shop item now becomes its own row in the
// shop_line_items table, instead of a client-computed running total
// PATCHed onto the booking record. This fixes the double-click race:
// two rapid POSTs land as two independent rows, not two writers racing
// to update the same shop_charge number.

/**
 * Creates a single shop line-item row.
 *
 * @param {{
 *   booking_id: string,
 *   Client_Booking_Ref: string|null,
 *   item_name: string,
 *   qty: number,
 *   unit_price: number,
 *   created_by: string,
 *   created_at: string
 * }} payload
 * @returns {Promise<{ ok: boolean, line_item_id?: string, error?: string }>}
 */
export async function addShopLineItem(payload) {
  _logPayload("POST /shop_line_items", payload);

  try {
    const response = await fetch(`${AIRTABLE_URL}/shop_line_items`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ fields: payload })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    const data = await response.json();
    return { ok: true, line_item_id: data.id };
  } catch (err) {
    return _handleError(err);
  }
}

/**
 * Fetches shop line-item rows. With no arguments, fetches every row
 * (existing behavior, used by main.js's _loadRooms). Pass `bookingId`
 * to scope the fetch to a single booking — used by the booking-delete
 * cleanup flow so it doesn't have to pull the whole table just to find
 * the handful of rows tied to one booking.
 *
 * @param {{ bookingId?: string }} [opts]
 * @returns {Promise<{ ok: boolean, items?: Object[], error?: string }>}
 */
export async function fetchShopLineItems({ bookingId } = {}) {
  try {
    const url = bookingId
      ? `${AIRTABLE_URL}/shop_line_items?filterByFormula=${encodeURIComponent(`{booking_id} = "${bookingId}"`)}`
      : `${AIRTABLE_URL}/shop_line_items`;
    const response = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return { ok: true, items: data.records.map((r) => ({ line_item_id: r.id, ...r.fields })) };
  } catch (err) {
    return _handleError(err);
  }
}

// ─────────────────────────────────────────────────────
// DELETE BOOKING (+ its shop_line_items)
// ─────────────────────────────────────────────────────
//
// Backs the "Delete booking" action from both the occupied-room
// checkout panel and the Booking History table. Deleting the booking
// record on its own would leave orphaned shop_line_items rows behind
// (they link to a booking_id that no longer exists), so callers pair
// this with deleteShopLineItems() — see _deleteBookingAndCleanup() in
// main.js.

/**
 * Deletes a single booking record.
 *
 * @param {string} airtableId - the booking's Airtable record id
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function deleteBooking(airtableId) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/bookings/${airtableId}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`, response);
    return { ok: true };
  } catch (err) {
    return _handleError(err);
  }
}

/**
 * Deletes shop_line_items rows by id, batched into groups of
 * AIRTABLE_BATCH_LIMIT (Airtable's batch-delete endpoint accepts up to
 * 10 ids per request, passed as repeated `records[]` query params).
 *
 * @param {string[]} lineItemIds
 * @returns {Promise<{
 *   ok: boolean,
 *   deleted_ids: string[],
 *   partial?: boolean,
 *   failedBatches?: Object[],   // [{ batchIndex, ids, error }]
 *   error?: string
 * }>}
 */
export async function deleteShopLineItems(lineItemIds) {
  if (!Array.isArray(lineItemIds) || lineItemIds.length === 0) {
    return { ok: true, deleted_ids: [] };
  }

  const batches = _chunk(lineItemIds, AIRTABLE_BATCH_LIMIT);
  const deletedIds = [];
  const failedBatches = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const query = batch.map((id) => `records[]=${encodeURIComponent(id)}`).join("&");

    try {
      const response = await fetch(`${AIRTABLE_URL}/shop_line_items?${query}`, {
        method: "DELETE",
        headers: getHeaders()
      });

      if (!response.ok) {
        const errResult = await _handleError(`HTTP ${response.status}: batch ${i + 1} failed`, response);
        failedBatches.push({ batchIndex: i, ids: batch, error: errResult.error });
        continue; // One bad batch shouldn't sink deletes in the other batches.
      }

      const data = await response.json();
      (data.records ?? []).forEach((r) => deletedIds.push(r.id));
    } catch (err) {
      const errResult = await _handleError(err);
      failedBatches.push({ batchIndex: i, ids: batch, error: errResult.error });
    }
  }

  if (failedBatches.length === 0) {
    return { ok: true, deleted_ids: deletedIds };
  }

  if (deletedIds.length === 0) {
    return { ok: false, deleted_ids: [], error: "All batches failed.", failedBatches };
  }

  return { ok: true, partial: true, deleted_ids: deletedIds, failedBatches };
}

// ─────────────────────────────────────────────────────
// RESERVATIONS (website bookings — reservations +
// reservation_line_items tables)
// ─────────────────────────────────────────────────────
//
// These mirror fetchRooms()/fetchExpenses() exactly. Turning a
// reservation line item into an actual occupied room is NOT handled
// here — that reuses the existing checkIn()/bulkCheckIn() above, then
// calls patchReservationLineItem() below to mark the line item
// checked_in and record which room/booking it landed on. See
// main.js's reservation-assignment handler for that orchestration.
//
// FIELD NAME NOTE: the real Airtable field on both `reservations` and
// `reservation_line_items` is called `status_reading`, not `status`
// (renamed from the original `status` single-select — see project
// history). `reservation_line_items` currently still has a leftover,
// unused `Status` field alongside it too; that one is ignored here.
// Rather than have every caller (state.js, ReservationsTab.js,
// main.js) know about this Airtable-specific field name, it's
// aliased to a clean `.status` property right here at the fetch/patch
// boundary — so everywhere else in the app just reads/writes
// `.status` like any other field.

// 10. FETCH RESERVATIONS
export async function fetchReservations() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/reservations`, { method: "GET", headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return {
      ok: true,
      reservations: data.records.map((r) => ({
        airtable_id: r.id,
        ...r.fields,
        status: r.fields.status_reading
      }))
    };
  } catch (err) {
    return _handleError(err);
  }
}

// 11. FETCH RESERVATION LINE ITEMS
export async function fetchReservationLineItems() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/reservation_line_items`, { method: "GET", headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return {
      ok: true,
      items: data.records.map((r) => ({
        line_item_id: r.id,
        ...r.fields,
        status: r.fields.status_reading
      }))
    };
  } catch (err) {
    return _handleError(err);
  }
}

// 12. PATCH RESERVATION LINE ITEM
export async function patchReservationLineItem(lineItemId, { status, ...rest }) {
  try {
    const fields = { ...rest };
    // Translate the app-facing `status` key back to the real Airtable
    // field name (`status_reading`) on the way out.
    if (status !== undefined) fields.status_reading = status;

    const response = await fetch(`${AIRTABLE_URL}/reservation_line_items/${lineItemId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ fields })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`, response);
    return { ok: true };
  } catch (err) {
    return _handleError(err);
  }
}

// --- ADD THESE EXPENSE FUNCTIONS TO api.js ---

// 6. FETCH EXPENSES
export async function fetchExpenses() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses`, { method: "GET", headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return { ok: true, expenses: data.records.map((r) => ({ expense_id: r.id, ...r.fields })) };
  } catch (err) {
    return _handleError(err);
  }
}

// 7. ADD EXPENSE
export async function addExpenseAPI(payload) {
  _logPayload("POST /expenses", payload);

  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ fields: payload })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    const data = await response.json();
    return { ok: true, expense_id: data.id };
  } catch (err) {
    return _handleError(err);
  }
}

// 8. PATCH EXPENSE
export async function patchExpenseAPI(expenseId, payload) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses/${expenseId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ fields: payload })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    return { ok: true };
  } catch (err) {
    return _handleError(err);
  }
}

// 9. DELETE EXPENSE
export async function deleteExpenseAPI(expenseId) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses/${expenseId}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    return { ok: true };
  } catch (err) {
    return _handleError(err);
  }
}
