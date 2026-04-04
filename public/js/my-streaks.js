// /public/js/my-streaks.js
// Purpose: My Streaks page logic
// - Auth gate
// - Summary streak values
// - Monthly calendar view for the current / selected month
// - Reads completed check-in dates from localStorage["ig-completed-checkin-dates"]

"use strict";
console.log("[my-streaks] loaded", { href: location.href });

// -----------------------------------------
// Storage keys
// -----------------------------------------
const STREAK_KEY = "ig-daily-streak";
const LAST_DATE_KEY = "ig-last-streak-date";
const LONGEST_KEY = "ig-longest-streak";
const COMPLETED_DATES_KEY = "ig-completed-checkin-dates";

// -----------------------------------------
// Calendar state
// -----------------------------------------
let visibleMonthDate = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1
);

// -----------------------------------------
// DOM helper
// -----------------------------------------
function $(id) {
  const el = document.getElementById(id);
  if (!el) console.log("[my-streaks] missing element:", id);
  return el;
}

// -----------------------------------------
// Safe localStorage readers
// -----------------------------------------
function readInt(key) {
  try {
    const raw = localStorage.getItem(key);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function readStr(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (_) {
    return "";
  }
}

function readCompletedDates() {
  try {
    const raw = localStorage.getItem(COMPLETED_DATES_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cleaned = parsed
      .map((value) => {
        if (typeof value !== "string") return null;

        const parts = value.split("-");
        if (parts.length !== 3) return null;

        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        if (!year || !month || !day) return null;

        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      })
      .filter(Boolean);

    return Array.from(new Set(cleaned)).sort();
  } catch (_) {
    return [];
  }
}
// DEBUG: dump all streak-related localStorage values
function debugDumpStreakStorage() {
  try {
    console.log("========== STREAK DEBUG START ==========");

    // Log every localStorage key first so we can see the real names in use
    const allKeys = Object.keys(localStorage);
    console.log("All localStorage keys:", allKeys);

    // Log only likely streak/auth keys
    const interestingKeys = allKeys.filter((key) =>
      key.toLowerCase().includes("streak") ||
      key.toLowerCase().includes("history") ||
      key.toLowerCase().includes("emotion") ||
      key.toLowerCase().includes("auth") ||
      key.toLowerCase().includes("user")
    );

    console.log("Interesting localStorage keys:", interestingKeys);

    interestingKeys.forEach((key) => {
      const rawValue = localStorage.getItem(key);
      console.log(`[localStorage] ${key}:`, rawValue);

      try {
        const parsed = JSON.parse(rawValue);
        console.log(`[parsed] ${key}:`, parsed);
      } catch (err) {
        console.log(`[parsed] ${key}: not JSON`);
      }
    });

    console.log("=========== STREAK DEBUG END ===========");
  } catch (err) {
    console.error("debugDumpStreakStorage failed:", err);
  }
}
// -----------------------------------------
// Guest detection
// -----------------------------------------
function isGuestLocal() {
  try {
    const raw = localStorage.getItem("currentUser");
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.role) return String(u.role).toLowerCase() === "guest";
    }
    return localStorage.getItem("ig_is_guest") === "true";
  } catch (_) {
    return false;
  }
}

// -----------------------------------------
// Auth
// -----------------------------------------
async function fetchMe() {
  if (!window.apiFetch) {
    console.log("[my-streaks] window.apiFetch missing");
    return null;
  }

  try {
    const me = await window.apiFetch("/api/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    return me;
  } catch (e) {
    console.log("[my-streaks] /api/me failed:", e);
    return null;
  }
}

async function canViewStreaks() {
  try {
    const raw = localStorage.getItem("currentUser") || "";
    if (raw) {
      const u = JSON.parse(raw);
      const role = String(u?.role || "").toLowerCase();
      if (role && role !== "guest") return true;
      if (role === "guest") return false;
    }
  } catch (_) { }

  const localId = readStr("currentUserId");
  if (localId) return true;

  const me = await fetchMe();
  if (me && (me._id || me.id || me.email)) {
    const role = String(me.role || "").toLowerCase();
    if (role === "guest") return false;
    return true;
  }

  if (isGuestLocal()) return false;

  return false;
}

// -----------------------------------------
// Date helpers
// -----------------------------------------
function formatDateKeyLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysLocal(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameMonth(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth()
  );
}

function getMonthLabel(date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function getRunType(dateKey, completedSet) {
  const currentDate = new Date(dateKey + "T00:00:00");
  const prevKey = formatDateKeyLocal(addDaysLocal(currentDate, -1));
  const nextKey = formatDateKeyLocal(addDaysLocal(currentDate, 1));

  const hasPrev = completedSet.has(prevKey);
  const hasNext = completedSet.has(nextKey);

  if (!hasPrev && !hasNext) return "single";
  if (!hasPrev && hasNext) return "start";
  if (hasPrev && hasNext) return "middle";
  return "end";
}

// -----------------------------------------
// Build month data
// -----------------------------------------
function buildMonthGrid(viewDate) {
  const completedDates = readCompletedDates();
  const completedSet = new Set(completedDates);

  const today = new Date();
  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const todayKey = formatDateKeyLocal(todayOnly);

  const year = viewDate.getFullYear();
  const monthIndex = viewDate.getMonth();

  const firstOfMonth = new Date(year, monthIndex, 1);
  const lastOfMonth = new Date(year, monthIndex + 1, 0);

  const mondayFirstIndex = (firstOfMonth.getDay() + 6) % 7;

  const cells = [];

  for (let i = 0; i < mondayFirstIndex; i += 1) {
    cells.push({ type: "blank" });
  }

  for (let day = 1; day <= lastOfMonth.getDate(); day += 1) {
    const cellDate = new Date(year, monthIndex, day);
    const dateKey = formatDateKeyLocal(cellDate);
    const isToday = dateKey === todayKey;
    const isFuture = cellDate.getTime() > todayOnly.getTime();
    const isComplete = completedSet.has(dateKey);

    cells.push({
      type: "day",
      dateKey,
      dayNumber: day,
      isToday,
      isFuture,
      isComplete,
      runType: isComplete ? getRunType(dateKey, completedSet) : "none",
    });
  }

  return cells;
}

// -----------------------------------------
// Render summary values
// -----------------------------------------
function renderStreakSummary() {
  const daily = $("dailyStreakVal");
  const longest = $("longestStreakVal");
  const lastEl = $("lastDateVal");

  const dailyValue = readInt(STREAK_KEY);
  const longestValue = readInt(LONGEST_KEY);
  const last = readStr(LAST_DATE_KEY);

  console.log("[my-streaks][summary]", {
    STREAK_KEY,
    dailyValue,
    LONGEST_KEY,
    longestValue,
    LAST_DATE_KEY,
    last,
  });

  if (daily) daily.textContent = String(dailyValue);
  if (longest) longest.textContent = String(longestValue);
  if (lastEl) lastEl.textContent = last || "—";
}
// -----------------------------------------
// Render month title
// -----------------------------------------
function renderMonthTitle() {
  const title = $("monthTitle");
  if (!title) return;

  title.textContent = getMonthLabel(visibleMonthDate);
}

// -----------------------------------------
// Render month grid
// -----------------------------------------
function renderMonthCalendar() {
  const grid = $("monthCalendarGrid");
  if (!grid) return;

  const cells = buildMonthGrid(visibleMonthDate);
  const completedDates = readCompletedDates();

  console.log("[my-streaks][calendar] visibleMonth", {
    label: getMonthLabel(visibleMonthDate),
    year: visibleMonthDate.getFullYear(),
    monthIndex: visibleMonthDate.getMonth(),
    monthNumber: visibleMonthDate.getMonth() + 1,
    completedDates,
  });
  grid.innerHTML = "";

  cells.forEach((cell) => {
    const cellEl = document.createElement("div");
    if (cell.type === "day") {
      console.log("[my-streaks][calendar][cell]", {
        dateKey: cell.dateKey,
        dayNumber: cell.dayNumber,
        isToday: cell.isToday,
        isFuture: cell.isFuture,
        isComplete: cell.isComplete,
        runType: cell.runType,
      });
    }
    if (cell.type === "blank") {
      cellEl.className = "streak-day streak-day-blank";
      grid.appendChild(cellEl);
      return;
    }

    cellEl.className = "streak-day";

    if (cell.isToday) cellEl.classList.add("is-today");
    if (cell.isFuture) cellEl.classList.add("is-future");
    if (cell.isComplete) cellEl.classList.add("is-complete");
    if (cell.isComplete) {
      cellEl.classList.add(`run-${cell.runType}`);
    }
    const connector = document.createElement("div");
    connector.className = "streak-day-connector";

    const circle = document.createElement("div");
    circle.className = "streak-day-circle";

    const label = document.createElement("span");
    label.className = "streak-day-number";
    label.textContent = String(cell.dayNumber);

    circle.appendChild(label);

    if (cell.isComplete) {
      const check = document.createElement("span");
      check.className = "streak-day-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      circle.appendChild(check);
    }

    cellEl.appendChild(connector);
    cellEl.appendChild(circle);

    grid.appendChild(cellEl);
  });

  console.log("[my-streaks] calendar rendered", {
    month: getMonthLabel(visibleMonthDate),
    cells: cells.length,
  });
}

function renderCalendarSection() {
  renderMonthTitle();
  renderMonthCalendar();
}

// -----------------------------------------
// Visibility
// -----------------------------------------
function showGate() {
  console.log("[my-streaks] showGate()");

  const gate = $("authGateCard");
  const card = $("streaksCard");

  if (gate) gate.hidden = false;
  if (card) card.hidden = true;
}

function showStreaks() {
  console.log("[my-streaks] showStreaks()");

  const gate = $("authGateCard");
  const card = $("streaksCard");

  if (gate) gate.hidden = true;
  if (card) card.hidden = false;

  renderStreakSummary();
  renderCalendarSection();
}

// -----------------------------------------
// Button wiring
// -----------------------------------------
function wireButtons() {
  const login = $("goLoginBtn");
  const prevMonthBtn = $("prevMonthBtn");
  const nextMonthBtn = $("nextMonthBtn");

  if (login) {
    login.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
  }

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      visibleMonthDate = new Date(
        visibleMonthDate.getFullYear(),
        visibleMonthDate.getMonth() - 1,
        1
      );
      renderCalendarSection();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      visibleMonthDate = new Date(
        visibleMonthDate.getFullYear(),
        visibleMonthDate.getMonth() + 1,
        1
      );
      renderCalendarSection();
    });
  }
}

// -----------------------------------------
// Debug helper
// -----------------------------------------
function debugStreakState() {
  const rawDaily = readStr(STREAK_KEY);
  const rawLongest = readStr(LONGEST_KEY);
  const rawLast = readStr(LAST_DATE_KEY);
  const completedDates = readCompletedDates();

  console.log("[my-streaks][debug] raw:", {
    rawDaily,
    rawLongest,
    rawLast,
    completedDates,
  });
}

// -----------------------------------------
// Init
// -----------------------------------------
async function init() {
  console.log("[my-streaks] init start");

  const status = $("statusLine");
  if (status) {
    status.hidden = false;
    status.textContent = "Loading…";
  }

  const ok = await canViewStreaks();

  console.log("[my-streaks] canViewStreaks =", ok, {
    hasCurrentUser: !!readStr("currentUser"),
    hasCurrentUserId: !!readStr("currentUserId"),
    isGuestLocal: isGuestLocal(),
  });

  if (status) status.hidden = true;

  if (!ok) {
    showGate();
    return;
  }

  debugDumpStreakStorage();
  debugStreakState();
  showStreaks();
}

document.addEventListener("DOMContentLoaded", () => {
  wireButtons();
  init();
});