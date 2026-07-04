// api.js - FULLY MIGRATED TO AIRTABLE
const AIRTABLE_BASE_ID = 'appy89xrqTChzanDq';
const AIRTABLE_TOKEN = 'pat8QF6HLm4msqOmj.6d84422f5599d3d7245dc968b0c9925c1c72bb77ccf53dc9c60b2f1f37f245bf';
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

const getHeaders = () => ({
  'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
  'Content-Type': 'application/json'
});

// Add this helper function at the top of api.js
function _logPayload(action, payload) {
  console.log(`%c[Vintex API] Outgoing Request: ${action}`, "color: #007bff; font-weight: bold;");
  console.log(JSON.stringify(payload, null, 2));
}

// This replaces your existing function at the top of api.js
// Make the function async
async function _handleError(err, response = null) {
  let message = err instanceof Error ? err.message : String(err ?? 'Unknown error');

  if (response) {
    try {
      // Await the parsing to ensure it finishes before we continue
      const errorBody = await response.json();
      console.error('--- AIRTABLE ERROR DETAILS ---');
      console.error(JSON.stringify(errorBody, null, 2));
    } catch (e) {
      console.error('Could not parse error response:', e);
    }
  }

  console.error('[Vintex API]', message);
  return { ok: false, error: message };
}

// 1. FETCH ROOMS
export async function fetchRooms() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/rooms`, { method: 'GET', headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return { ok: true, rooms: data.records.map(r => ({ airtable_id: r.id, ...r.fields })) };
  } catch (err) { return _handleError(err); }
}

// 2. CHECK IN (POST to Airtable)
export async function checkIn(payload) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/bookings`, {
      method: 'POST',
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
  } catch (err) { return _handleError(err); }
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
const FORMULA_FIELDS = ['rate_variance', 'grand_total'];

/** Splits an array into chunks of at most `size` items. */
function _chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/** Strips Airtable formula fields out of a single record's field map. */
function _sanitizeBookingFields(fields) {
  const clean = { ...fields };
  FORMULA_FIELDS.forEach((key) => delete clean[key]);
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
    return { ok: false, error: 'bulkCheckIn requires a non-empty array of booking records.' };
  }

  const batches = _chunk(recordsArray, AIRTABLE_BATCH_LIMIT);
  const createdIds = [];
  const failedBatches = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const payload = {
      records: batch.map((record) => ({
        fields: {
          ..._sanitizeBookingFields(record),
          // Same invariant as checkIn(): every freshly created booking
          // must land as active so _mergeData() in main.js treats it as
          // the room's current occupant on the next poll.
          is_active: true
        }
      }))
    };

    _logPayload(`POST /bookings (batch ${i + 1}/${batches.length})`, payload);

    try {
      const response = await fetch(`${AIRTABLE_URL}/bookings`, {
        method: 'POST',
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
    return { ok: false, error: 'All batches failed.', failedBatches };
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
    const response = await fetch(`${AIRTABLE_URL}/bookings/${airtableId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({
        fields: {
          is_active: false,
          payment_status: 'paid',
          payment_method: payload.payment_method,
          mpesa_code: payload.mpesa_code
        }
      }),
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    return { ok: true };
  } catch (err) { return _handleError(err); }
}

// 4. FETCH BOOKINGS (the relational counterpart to fetchRooms)
export async function fetchBookings() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/bookings`, { method: 'GET', headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return { ok: true, bookings: data.records.map(r => ({ airtable_id: r.id, ...r.fields })) };
  } catch (err) { return _handleError(err); }
}

// 5. ADD SHOP ITEM (PATCH to Airtable)
export async function addShopItem(airtableId, payload) {
  try {
    // You will need to fetch the existing total first, then PATCH the update
    const response = await fetch(`${AIRTABLE_URL}/bookings/${airtableId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({
        fields: {
          shop_charge: payload.new_shop_total,
        }
      }),
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    return { ok: true };
  } catch (err) { return _handleError(err); }
}

// --- ADD THESE EXPENSE FUNCTIONS TO api.js ---

// 6. FETCH EXPENSES
export async function fetchExpenses() {
  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses`, { method: 'GET', headers: getHeaders() });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return { ok: true, expenses: data.records.map(r => ({ expense_id: r.id, ...r.fields })) };
  } catch (err) { return _handleError(err); }
}

// 7. ADD EXPENSE
export async function addExpenseAPI(payload) {
  _logPayload('POST /expenses', payload);

  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ fields: payload })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}`, response);
    const data = await response.json();
    return { ok: true, expense_id: data.id };
  } catch (err) { return _handleError(err); }
}

// 8. PATCH EXPENSE
export async function patchExpenseAPI(expenseId, payload) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ fields: payload })
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    return { ok: true };
  } catch (err) { return _handleError(err); }
}

// 9. DELETE EXPENSE
export async function deleteExpenseAPI(expenseId) {
  try {
    const response = await fetch(`${AIRTABLE_URL}/expenses/${expenseId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!response.ok) return _handleError(`HTTP ${response.status}: ${response.statusText}`);
    return { ok: true };
  } catch (err) { return _handleError(err); }
}