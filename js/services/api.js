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