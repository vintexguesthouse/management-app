/**
 * js/main.js
 * ─────────────────────────────────────────────────────
 * Vintex Guest House — Main Application Entry Point v2
 *
 * Responsibilities:
 * 1.  Bootstrap behind the auth gate (initAuthGate)
 * 2.  Pull rooms + expenses from the API → push into state
 * 3.  Subscribe to state changes → re-render the active view
 * 4.  Route between Dashboard and Expenses views via nav buttons
 * 5.  Orchestrate check-in / POS / checkout callbacks (rooms)
 * 6.  Expenses view controller:
 * Attendant  → filtered list (own rows only) + add form
 * Owner      → full list + add + edit + delete
 * 7.  Inject active user ID into every API write payload
 */

import {
  getState,
  setState,
  setRooms,
  setActiveRoom,
  patchRoom,
  setExpenses,
  addExpense,
  patchExpense,
  removeExpense,
  setActiveView,
  setSyncStatus,
  on
} from "./services/state.js";

// ADDED: Added clean Airtable CRUD operations here
import {
  fetchRooms,
  fetchBookings,
  checkIn,
  addShopItem,
  checkOut,
  fetchExpenses,
  addExpenseAPI,
  patchExpenseAPI,
  deleteExpenseAPI
} from "./services/api.js";

import { initAuthGate, getActiveUser, getActiveRole } from "./services/auth.js";

import { renderRoomsGrid } from "./components/RoomCard.js";
import { openModal as openCheckInModal, closeModal as closeCheckInModal } from "./components/CheckInModal.js";
import {
  openModal as openCheckOutModal,
  closeModal as closeCheckOutModal,
  refreshOccupiedTotals
} from "./components/CheckOutModal.js";
import { printReceipt } from "./components/Receipt.js";

let CURRENT_ROLE = null;
let _activeRoomFilter = "all";

// ─────────────────────────────────────────────────────
// Room definitions (canonical local list)
// ─────────────────────────────────────────────────────

const ROOM_DEFINITIONS = [
  { room_name: "Charity", room_type: "Bed & Breakfast", base_rate: 3500 },
  { room_name: "Chastity", room_type: "Bed Only", base_rate: 2500 },
  { room_name: "Faithfulness", room_type: "Bed & Breakfast", base_rate: 3500 },
  { room_name: "Generosity", room_type: "Bed & Breakfast", base_rate: 4000 },
  { room_name: "Goodness", room_type: "Bed Only", base_rate: 2500 },
  { room_name: "Grace", room_type: "Bed & Breakfast", base_rate: 3500 },
  { room_name: "Joy", room_type: "Bed Only", base_rate: 2500 },
  { room_name: "Kindness", room_type: "Bed & Breakfast", base_rate: 3500 },
  { room_name: "Love", room_type: "Bed & Breakfast", base_rate: 4500 },
  { room_name: "Mercy", room_type: "Bed Only", base_rate: 2500 },
  { room_name: "Modesty", room_type: "Bed Only", base_rate: 2500 },
  { room_name: "Patience", room_type: "Bed & Breakfast", base_rate: 3500 },
  { room_name: "Self-Control", room_type: "Bed Only", base_rate: 2500 },
  { room_name: "Peace", room_type: "Bed & Breakfast", base_rate: 4000 }
];

// ─────────────────────────────────────────────────────
// Toast helper
// ─────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(type, title, body = "") {
  const toast = document.getElementById("toast");
  const iconEl = document.getElementById("toast-icon");
  const titleEl = document.getElementById("toast-title");
  const bodyEl = document.getElementById("toast-body");
  if (!toast) return;

  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  iconEl.textContent = icons[type] ?? "ℹ️";
  titleEl.textContent = title;
  bodyEl.textContent = body;

  toast.classList.remove("translate-y-10", "opacity-0", "pointer-events-none");
  toast.classList.add("translate-y-0", "opacity-100");

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.add("translate-y-10", "opacity-0", "pointer-events-none");
    toast.classList.remove("translate-y-0", "opacity-100");
  }, 3500);
}

// ─────────────────────────────────────────────────────
// Utility formatters
// ─────────────────────────────────────────────────────

function _ksh(n) {
  return `KSH ${Number(n ?? 0).toLocaleString("en-KE")}`;
}

function _fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// ─────────────────────────────────────────────────────
// Header / stats
// ─────────────────────────────────────────────────────

function _updateHeaderStats(rooms) {
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const available = rooms.length - occupied;
  document.getElementById("stat-available").textContent = available;
  document.getElementById("stat-occupied").textContent = occupied;
  document.getElementById("stat-total").textContent = rooms.length;
}

function _updateHeaderDate() {
  const el = document.getElementById("header-date");
  if (el) {
    el.textContent = new Date().toLocaleDateString("en-KE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }
}

function _startClock() {
  const el = document.getElementById("sidebar-clock");
  const tick = () => {
    if (el)
      el.textContent = new Date().toLocaleTimeString("en-KE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
  };
  tick();
  setInterval(tick, 1000);
}

// ─────────────────────────────────────────────────────
// View routing
// ─────────────────────────────────────────────────────

const VIEW_IDS = {
  dashboard: "view-dashboard",
  expenses: "view-expenses",
  history: "view-history" // ADDED
};

const VIEW_TITLES = {
  dashboard: "Room Dashboard",
  expenses: "Expenses Log",
  history: "Booking History" // ADDED
};

function _switchView(view) {
  Object.values(VIEW_IDS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  const target = document.getElementById(VIEW_IDS[view]);
  if (target) target.classList.remove("hidden");

  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.textContent = VIEW_TITLES[view] ?? "";

  const statsBar = document.getElementById("occupancy-stats");
  if (statsBar) {
    statsBar.style.display = view === "dashboard" ? "" : "none";
  }

  if (view === "history") {
    _renderHistoryView();
  }

  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  if (view === "expenses") {
    _renderExpenses();
    _loadExpenses();
  }

  setActiveView(view);
}

function _wireNavLinks() {
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      _switchView(/** @type {any} */ (btn.dataset.view));
    });
  });
}

// ─────────────────────────────────────────────────────
// Refresh button
// ─────────────────────────────────────────────────────

function _wireRefreshButton() {
  const btn = document.getElementById("btn-refresh");
  const icon = document.getElementById("refresh-icon");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    icon?.classList.add("spin-once");
    setTimeout(() => icon?.classList.remove("spin-once"), 650);

    const { ui } = getState();
    if (ui.activeView === "expenses") {
      await _loadExpenses();
    } else {
      await _loadRooms();
    }
  });
}

// ─────────────────────────────────────────────────────
// Sidebar drawer (mobile hamburger menu)
// ─────────────────────────────────────────────────────

function _wireSidebarDrawer() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const openBtn = document.getElementById("btn-open-drawer");
  const closeBtn = document.getElementById("btn-close-drawer");
  if (!sidebar || !overlay || !openBtn) return;

  const openDrawer = () => {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
    document.body.classList.add("drawer-open");
    requestAnimationFrame(() => overlay.classList.remove("opacity-0"));
    openBtn.setAttribute("aria-expanded", "true");
  };

  const closeDrawer = () => {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("opacity-0");
    document.body.classList.remove("drawer-open");
    openBtn.setAttribute("aria-expanded", "false");
    setTimeout(() => overlay.classList.add("hidden"), 300);
  };

  openBtn.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);

  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.innerWidth < 768) closeDrawer();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sidebar.classList.contains("-translate-x-full")) {
      closeDrawer();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 768) closeDrawer();
  });
}

function _syncHeaderHeightVar() {
  const header = document.getElementById("app-header");
  if (!header) return;
  document.documentElement.style.setProperty("--header-height", `${header.offsetHeight}px`);
}

// ─────────────────────────────────────────────────────
// Status-first filter bar
// ─────────────────────────────────────────────────────

function _applyRoomFilter(filter) {
  _activeRoomFilter = filter;
  const grid = document.getElementById("rooms-grid");
  if (!grid) return;

  grid.querySelectorAll(".room-card").forEach((card) => {
    const matches = filter === "all" || card.dataset.status === filter;
    card.classList.toggle("hidden", !matches);
  });
}

function _wireRoomFilterBar() {
  const bar = document.getElementById("room-filter-bar");
  if (!bar) return;

  bar.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _applyRoomFilter(btn.dataset.filter);
    });
  });
}

// ─────────────────────────────────────────────────────
// Room data loading & reconciliation
// ─────────────────────────────────────────────────────

function _mergeData(rooms, bookings) {
  const roomsByName = new Map((rooms ?? []).map((r) => [r.room_name, r]));
  const activeBookingsByRoom = new Map();
  (bookings ?? []).filter((b) => b.is_active === true).forEach((b) => activeBookingsByRoom.set(b.room_name, b));

  const { rooms: currentState } = getState();

  return ROOM_DEFINITIONS.map((def) => {
    const liveRoom = roomsByName.get(def.room_name);
    const activeBooking = activeBookingsByRoom.get(def.room_name) ?? null;
    const local = currentState.find((r) => r.room_name === def.room_name);

    if (local && local.status === "occupied" && !activeBooking && !(liveRoom && liveRoom.status === "occupied")) {
      return local;
    }

    if (activeBooking) {
      return {
        ...def,
        ...(liveRoom ?? {}),
        status: "occupied",
        booking_id: activeBooking.airtable_id,
        guest_name: activeBooking.guest_name,
        nights: Number(activeBooking.nights || 1),
        charged_rate: Number(activeBooking.charged_rate || def.base_rate),
        payment_status: activeBooking.payment_status || "unpaid",
        check_in: activeBooking.check_in || activeBooking.created_at || new Date().toISOString(),
        shop_total: Number(activeBooking.shop_charge || 0),
        shop_items: Array.isArray(local?.shop_items) ? local.shop_items : [],
        activeBooking
      };
    }

    return {
      status: "available",
      guest_name: null,
      check_in: null,
      booking_id: null,
      charged_rate: null,
      shop_total: 0,
      shop_items: [],
      nights: null,
      payment_status: null,
      activeBooking: null,
      ...def
    };
  });
}

async function _loadRooms() {
  setState({ ui: { ...getState().ui, loading: true } }, "loadRooms");
  const [roomsResult, bookingsResult] = await Promise.all([fetchRooms(), fetchBookings()]);

  if (!roomsResult.ok) {
    setRooms(_mergeData([], []));
    showToast("error", "Sync failed", roomsResult.error ?? "Could not reach the server.");
    return;
  }

  if (!bookingsResult.ok) {
    setRooms(_mergeData(roomsResult.rooms, []));
    showToast("error", "Bookings sync failed", bookingsResult.error ?? "Could not reach the server.");
    return;
  }

  setRooms(_mergeData(roomsResult.rooms, bookingsResult.bookings));
}

// ─────────────────────────────────────────────────────
// Expense data loading (UPDATED FOR AIRTABLE)
// ─────────────────────────────────────────────────────

async function _loadExpenses() {
  setState({ ui: { ...getState().ui, expensesLoading: true } }, "loadExpenses");

  const result = await fetchExpenses();

  if (result.ok && Array.isArray(result.expenses)) {
    setExpenses(result.expenses);
  } else {
    setExpenses([]);
    showToast("error", "Expenses sync failed", result.error ?? "Could not reach Airtable.");
  }
}

// ─────────────────────────────────────────────────────
// Expenses view renderer
// ─────────────────────────────────────────────────────

function _renderExpenses() {
  const container = document.getElementById("expenses-container");
  if (!container) return;

  const isOwner = CURRENT_ROLE === "owner";
  const { expenses } = getState();

  const scopeLabel = document.getElementById("expenses-scope-label");
  if (scopeLabel) {
    scopeLabel.textContent = isOwner ? "(Owner View)" : "(Attendant View)";
  }

  const visible = isOwner
    ? expenses
    : expenses.filter((ex) => ex.created_by === "attendant_1" || ex.created_by === "attendant");

  const total = visible.reduce((sum, ex) => sum + Number(ex.amount ?? 0), 0);
  const totalBadge = document.getElementById("expenses-total-badge");
  if (totalBadge) {
    totalBadge.textContent = visible.length > 0 ? `Total: ${_ksh(total)}` : "";
  }

  if (visible.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <svg class="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0
               00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        </svg>
        <p class="text-sm text-gray-600">
          ${isOwner ? "No expenses have been logged yet." : "You have not logged any expenses yet."}
        </p>
      </div>`;
    return;
  }

  container.innerHTML = visible
    .map((ex) => {
      const amount = Number(ex.amount ?? 0);
      const category = ex.category ?? "—";
      const description = ex.description ?? "—";
      const createdBy = ex.created_by ?? "—";
      const createdAt = _fmtDate(ex.created_at);

      const ownerActions = isOwner
        ? `
      <div class="flex items-center gap-1.5 ml-3 shrink-0">
        <button
          type="button"
          data-expense-id="${ex.expense_id}"
          data-action="edit"
          title="Edit expense"
          class="expense-action-btn w-7 h-7 flex items-center justify-center rounded-lg
                 bg-gray-700 hover:bg-brand-700 text-gray-400 hover:text-white
                 border border-gray-600 hover:border-brand-500 transition-colors">
          <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2
                 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          type="button"
          data-expense-id="${ex.expense_id}"
          data-action="delete"
          title="Delete expense"
          class="expense-action-btn w-7 h-7 flex items-center justify-center rounded-lg
                 bg-gray-700 hover:bg-red-800 text-gray-400 hover:text-red-300
                 border border-gray-600 hover:border-red-700 transition-colors">
          <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5
                 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>`
        : "";

      return `
      <div
        data-expense-row="${ex.expense_id}"
        class="flex items-start bg-gray-900 border border-gray-800 rounded-xl px-4 py-3
               hover:border-gray-700 transition-colors">

        <div class="shrink-0 text-right min-w-[90px] mr-4">
          <p class="text-sm font-bold text-white font-mono">${_ksh(amount)}</p>
          <span class="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider
                       px-2 py-0.5 rounded-full bg-brand-900/50 text-brand-300 border border-brand-800/40">
            ${category}
          </span>
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-200 truncate">${description}</p>
          <div class="flex items-center gap-3 mt-1.5">
            <span class="text-xs text-gray-500 font-mono">${createdAt}</span>
            ${isOwner ? `<span class="text-xs text-gray-600">by <span class="text-gray-500">${createdBy}</span></span>` : ""}
          </div>
        </div>

        ${ownerActions}
      </div>`;
    })
    .join("");

  container.querySelectorAll(".expense-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expenseId = btn.dataset.expenseId;
      const action = btn.dataset.action;
      if (action === "edit") _openEditExpenseModal(expenseId);
      if (action === "delete") _handleDeleteExpense(expenseId);
    });
  });
}

// ─────────────────────────────────────────────────────
// Expenses form — Save new expense
// ─────────────────────────────────────────────────────

function _wireExpensesForm() {
  const saveBtn = document.getElementById("btn-save-expense");
  const indicator = document.getElementById("expense-saving-indicator");
  const errorBox = document.getElementById("expense-form-error");

  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const amountEl = document.getElementById("exp-amount");
    const categoryEl = document.getElementById("exp-category");
    const descriptionEl = document.getElementById("exp-description");

    const amount = Number(amountEl?.value ?? 0);
    const category = categoryEl?.value?.trim() ?? "";
    const description = descriptionEl?.value?.trim() ?? "";

    if (amount <= 0 || !category || !description) {
      if (errorBox) {
        errorBox.textContent = "Please fill in all fields: Amount, Category, and Description.";
        errorBox.classList.remove("hidden");
      }
      return;
    }

    if (errorBox) errorBox.classList.add("hidden");

    saveBtn.disabled = true;
    if (indicator) indicator.classList.remove("hidden");

    setSyncStatus("saving");
    const activeUser = getActiveUser();

    try {
      // 1. Define it first so it's not undefined
      const expenseData = {
        amount: Number(amount),
        category: category,
        description: description,
        // Ensure these keys match Airtable headers EXACTLY
        date: new Date().toISOString().split("T")[0]
      };

      // 2. Now you can safely log it
      console.table(expenseData);

      // 3. Now send it
      const result = await addExpenseAPI((expenseData));

      if (result.ok) {
        setSyncStatus("synced");

        addExpense({
          expense_id: result.expense_id ?? `local_${Date.now()}`,
          ...expenseData // This contains amount, category, description, and date
        });

        if (amountEl) amountEl.value = "";
        if (categoryEl) categoryEl.value = "";
        if (descriptionEl) descriptionEl.value = "";

        showToast("success", "Expense saved", `${_ksh(amount)} — ${category}`);
        _renderExpenses();
      } else {
        setSyncStatus("error");
        if (errorBox) {
          errorBox.textContent = result.error ?? "Failed to save expense.";
          errorBox.classList.remove("hidden");
        }
        showToast("error", "Save failed", result.error);
      }
    } catch (err) {
      setSyncStatus("error");
      if (errorBox) {
        errorBox.textContent = err.message;
        errorBox.classList.remove("hidden");
      }
      showToast("error", "Network error", err.message);
    } finally {
      saveBtn.disabled = false;
      if (indicator) indicator.classList.add("hidden");
    }
  });
}

// ─────────────────────────────────────────────────────
// Edit expense modal (Owner only)
// ─────────────────────────────────────────────────────

function _openEditExpenseModal(expenseId) {
  const { expenses } = getState();
  const expense = expenses.find((ex) => ex.expense_id === expenseId);
  if (!expense) return;

  const overlay = document.getElementById("edit-expense-overlay");
  const modal = document.getElementById("edit-expense-modal");

  document.getElementById("edit-expense-id").value = expense.expense_id;
  document.getElementById("edit-exp-amount").value = expense.amount;
  document.getElementById("edit-exp-category").value = expense.category;
  document.getElementById("edit-exp-description").value = expense.description;

  overlay?.classList.remove("hidden");
  modal?.classList.remove("hidden");
  requestAnimationFrame(() => overlay?.classList.replace("opacity-0", "opacity-100"));
}

function _closeEditExpenseModal() {
  const overlay = document.getElementById("edit-expense-overlay");
  const modal = document.getElementById("edit-expense-modal");
  overlay?.classList.replace("opacity-100", "opacity-0");
  setTimeout(() => {
    overlay?.classList.add("hidden");
    modal?.classList.add("hidden");
  }, 200);
}

function _wireEditExpenseModal() {
  document.getElementById("edit-expense-close")?.addEventListener("click", _closeEditExpenseModal);
  document.getElementById("edit-expense-close-btn")?.addEventListener("click", _closeEditExpenseModal);

  document.getElementById("btn-save-edit-expense")?.addEventListener("click", async () => {
    const expenseId = document.getElementById("edit-expense-id")?.value;
    const amount = Number(document.getElementById("edit-exp-amount")?.value ?? 0);
    const category = document.getElementById("edit-exp-category")?.value?.trim() ?? "";
    const description = document.getElementById("edit-exp-description")?.value?.trim() ?? "";

    if (!expenseId || amount <= 0 || !category || !description) {
      showToast("error", "Validation failed", "All fields are required.");
      return;
    }

    const saveBtn = document.getElementById("btn-save-edit-expense");
    if (saveBtn) saveBtn.disabled = true;

    try {
      // CHANGED: Swapped out old post payload with Airtable patch engine
      const result = await patchExpenseAPI(expenseId, {
        amount,
        category,
        description,
        edited_by: getActiveUser(),
        edited_at: new Date().toISOString()
      });

      if (result.ok) {
        patchExpense(expenseId, { amount, category, description });
        _closeEditExpenseModal();
        _renderExpenses();
        showToast("success", "Expense updated", `${_ksh(amount)} — ${category}`);
      } else {
        showToast("error", "Update failed", result.error);
      }
    } catch (err) {
      showToast("error", "Network error", err.message);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

// ─────────────────────────────────────────────────────
// Delete expense (Owner only)
// ─────────────────────────────────────────────────────

async function _handleDeleteExpense(expenseId) {
  if (!expenseId) return;

  const { expenses } = getState();
  const expense = expenses.find((ex) => ex.expense_id === expenseId);
  if (!expense) return;

  removeExpense(expenseId);
  _renderExpenses();
  showToast("info", "Deleting expense…", _ksh(expense.amount));

  try {
    // CHANGED: Connected delete flow straight to Airtable clean record removal
    const result = await deleteExpenseAPI(expenseId);

    if (result.ok) {
      showToast("success", "Expense deleted", _ksh(expense.amount));
    } else {
      addExpense(expense);
      _renderExpenses();
      showToast("error", "Delete failed", result.error);
    }
  } catch (err) {
    addExpense(expense);
    _renderExpenses();
    showToast("error", "Network error", err.message);
  }
}

// ─────────────────────────────────────────────────────
// Room card click → modal
// ─────────────────────────────────────────────────────

function _onCardClick(room) {
  setActiveRoom(room);

  if (room.status === "available") {
    openCheckInModal(room, {
      onCheckIn: _handleCheckIn,
      ownerMode: getActiveRole() === "owner"
    });
  } else if (room.status === "occupied") {
    openCheckOutModal(room, {
      onAddShop: _handleAddShop,
      onCheckOut: _handleCheckOut
    });
  }
}

// ─────────────────────────────────────────────────────
// Check-in handler
// ─────────────────────────────────────────────────────
async function _handleCheckIn(formData) {
  const created_by = getActiveUser() ?? "unknown";
  setSyncStatus("saving");

  patchRoom(formData.room_name, {
    status: "occupied",
    guest_name: formData.guest_name,
    nights: formData.nights,
    room_type: formData.room_type,
    charged_rate: formData.charged_rate,
    payment_status: formData.payment_status ?? "unpaid",
    check_in: new Date().toISOString(),
    shop_total: 0,
    shop_items: [],
    activeBooking: {
      room_name: formData.room_name,
      guest_name: formData.guest_name,
      nights: formData.nights,
      room_type: formData.room_type,
      charged_rate: formData.charged_rate,
      payment_status: formData.payment_status ?? "unpaid",
      check_in: new Date().toISOString(),
      shop_charge: 0,
      grand_total: formData.charged_rate * formData.nights,
      is_active: true
    }
  });

  closeCheckInModal();
  showToast("info", "Saving check-in…", formData.guest_name);

  // Define the payload for Airtable
  const airtablePayload = {
    room_name: formData.room_name,
    guest_name: formData.guest_name,
    nights: Number(formData.nights),
    check_in: new Date().toISOString().split("T")[0], // This sends "2026-06-30" instead of the full timestamp
    room_type: formData.room_type,
    base_rate: Number(formData.base_rate),
    charged_rate: Number(formData.charged_rate),
    shop_charge: 0,
    payment_status: formData.payment_status ?? "unpaid",
    is_active: true,
    created_by: created_by
  };

  // Perform the API call using the clean payload
  const result = await checkIn(airtablePayload);

  // REMOVED THE DUPLICATE: const result = await checkIn({ ...formData, created_by });

  if (result.ok) {
    setSyncStatus("synced");
    if (result.booking_id) {
      const { rooms } = getState();
      const current = rooms.find((r) => r.room_name === formData.room_name);
      patchRoom(formData.room_name, {
        booking_id: result.booking_id,
        activeBooking: { ...(current?.activeBooking ?? {}), airtable_id: result.booking_id }
      });
    }
    showToast("success", "Checked in!", `${formData.room_name} → ${formData.guest_name}`);
    setTimeout(_loadRooms, 3000);
  } else {
    setSyncStatus("error");
    patchRoom(formData.room_name, {
      status: "available",
      guest_name: null,
      nights: null,
      charged_rate: null,
      payment_status: null,
      check_in: null,
      booking_id: null,
      activeBooking: null
    });
    showToast("error", "Check-in failed", result.error);
  }
}

// ─────────────────────────────────────────────────────
// Shop item handler
// ─────────────────────────────────────────────────────

async function _handleAddShop({ item_name, item_price, quantity }) {
  const { activeRoom } = getState();
  if (!activeRoom) return;

  showToast("info", "Adding item…", `${quantity}× ${item_name}`);

  const lineTotal = item_price * quantity;
  const prevShopTotal = Number(activeRoom.shop_total ?? 0);
  const newShopTotal = prevShopTotal + lineTotal;
  const roomSubtotal = Number(activeRoom.charged_rate ?? activeRoom.base_rate ?? 0) * Number(activeRoom.nights ?? 1);
  const newGrandTotal = roomSubtotal + newShopTotal;

  const result = await addShopItem(activeRoom.booking_id, {
    new_shop_total: newShopTotal,
    new_grand_total: newGrandTotal
  });

  if (result.ok) {
    const prevItems = Array.isArray(activeRoom.shop_items) ? activeRoom.shop_items : [];
    const existingIdx = prevItems.findIndex((i) => i.name === item_name);
    const updatedItems =
      existingIdx >= 0
        ? prevItems.map((i, idx) => (idx === existingIdx ? { ...i, qty: (i.qty ?? 1) + quantity } : i))
        : [...prevItems, { name: item_name, unit_price: item_price, qty: quantity }];

    patchRoom(activeRoom.room_name, {
      shop_total: newShopTotal,
      shop_items: updatedItems
    });

    const { activeRoom: updatedActive } = getState();
    refreshOccupiedTotals(updatedActive);

    showToast("success", "Item added", `${quantity}× ${item_name} — ${_ksh(lineTotal)}`);
  } else {
    showToast("error", "Could not add item", result.error);
  }
}

// ─────────────────────────────────────────────────────
// Checkout handler
// ─────────────────────────────────────────────────────

async function _handleCheckOut({ payment_method, mpesa_code } = {}) {
  const { activeRoom } = getState();
  if (!activeRoom) return;

  const isPrePaid = activeRoom.payment_status === "paid";
  const accommodationTotal = isPrePaid ? 0 : Number(activeRoom.charged_rate ?? 0) * Number(activeRoom.nights ?? 1);
  const shopTotal = Number(activeRoom.shop_total ?? 0);
  const grandTotal = accommodationTotal + shopTotal;

  printReceipt({
    ...activeRoom,
    accommodation_total: accommodationTotal,
    grand_total: grandTotal
  });
  showToast("info", "Checking out…", activeRoom.room_name);

  const result = await checkOut(activeRoom.booking_id, {
    payment_method: payment_method ?? activeRoom.payment_method ?? null,
    mpesa_code: mpesa_code ?? activeRoom.mpesa_code ?? null
  });

  if (result.ok) {
    patchRoom(activeRoom.room_name, {
      status: "available",
      guest_name: null,
      check_in: null,
      booking_id: null,
      charged_rate: null,
      payment_status: null,
      shop_total: 0,
      shop_items: [],
      nights: null,
      activeBooking: null
    });
    closeCheckOutModal();
    showToast("success", "Checked out!", `${activeRoom.room_name} is now available.`);
    await _loadRooms();
  } else {
    showToast("error", "Check-out failed", result.error);
  }
}

// ─────────────────────────────────────────────────────
// State subscription → re-render
// ─────────────────────────────────────────────────────

function _subscribeToState() {
  on("change", ({ changedKeys }) => {
    if (changedKeys.includes("rooms")) {
      const { rooms } = getState();
      renderRoomsGrid(rooms, _onCardClick);
      _applyRoomFilter(_activeRoomFilter);
      _updateHeaderStats(rooms);
    }

    if (changedKeys.includes("expenses")) {
      const { ui } = getState();
      if (ui.activeView === "expenses") {
        _renderExpenses();
      }
    }

    if (changedKeys.includes("ui")) {
      const { ui } = getState();
      _renderSyncIndicator(ui.syncStatus);
    }
  });
}

// ─────────────────────────────────────────────────────
// Main init (called after auth passes)
// ─────────────────────────────────────────────────────

async function _init() {
  CURRENT_ROLE = getActiveRole();

  _updateHeaderDate();
  _startClock();
  _wireNavLinks();
  _wireRefreshButton();
  _wireExpensesForm();
  _wireEditExpenseModal();
  _wireSidebarDrawer();
  _wireRoomFilterBar();
  _subscribeToState();

  _syncHeaderHeightVar();
  window.addEventListener("load", _syncHeaderHeightVar);
  window.addEventListener("resize", _syncHeaderHeightVar);

  _switchView("dashboard");

  await _loadRooms();
  await _loadExpenses();

  setInterval(() => {
    _loadRooms();
    _loadExpenses();
  }, 30 * 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      _loadRooms();
      _renderExpenses();
    }
  });
}

// ─────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initAuthGate(_init);
});

function _renderSyncIndicator(status) {
  const icon = document.getElementById("sync-indicator");
  if (!icon) return;

  const colors = {
    synced: "bg-green-500",
    saving: "bg-yellow-500 animate-pulse",
    error: "bg-red-500"
  };

  icon.className = `w-3 h-3 rounded-full ${colors[status] || colors.synced}`;
  icon.title = `Status: ${status}`;
}

// Import the component
import { renderBookingHistory } from "./components/BookingHistory.js";

async function _renderHistoryView() {
  const container = document.getElementById("history-container");
  if (!container) return;

  container.innerHTML = '<p class="text-gray-500 text-center py-10">Loading history...</p>';

  // Reuse the existing fetchBookings API call
  const result = await fetchBookings();

  if (result.ok) {
    // Pass the raw bookings array to the component
    renderBookingHistory(result.bookings);
  } else {
    container.innerHTML = '<p class="text-red-500 text-center py-10">Failed to load history.</p>';
  }
}

// ─────────────────────────────────────────────────────
// Add this helper function at the bottom of main.js
// ─────────────────────────────────────────────────────
function _cleanDate(isoString) {
  return isoString.split("T")[0]; // Converts 2026-07-01T12:00:00Z to 2026-07-01
}


// Add this in main.js
function _prepareExpensePayload(amount, category, description) {
  return {
    amount: Number(amount),
    category: category,
    description: description,
    date: new Date().toISOString().split("T")[0] // Standardized format
  };
}