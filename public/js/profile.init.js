//
//  profile.init.js
//  Profile page bootstrap: auth, greeting, footer
//
"use strict";

// =========================
// Daily streak (frontend-only)
// =========================

(function initDailyStreak() {
  const STREAK_KEY = "ig-daily-streak";
  const LAST_DATE_KEY = "ig-last-streak-date";
  const LONGEST_KEY = "ig-longest-streak";
  const COMPLETED_DATES_KEY = "ig-completed-checkin-dates";

  function normalizeDateKey(key) {
    const parts = String(key || "").split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);

    if (!y || !m || !d) return null;

    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");

    return `${y}-${mm}-${dd}`;
  }
  function todayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Read longest streak (default to 0 if missing/invalid)
  function readLongest() {
    const raw = localStorage.getItem(LONGEST_KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function writeLongest(val) {
    localStorage.setItem(LONGEST_KEY, String(val));
  }

  function readStreak() {
    return parseInt(localStorage.getItem(STREAK_KEY), 10) || 0;
  }

  function writeStreak(val) {
    localStorage.setItem(STREAK_KEY, String(val));
  }

  function readLastDate() {
    return normalizeDateKey(localStorage.getItem(LAST_DATE_KEY));
  }

  function writeLastDate(val) {
    localStorage.setItem(LAST_DATE_KEY, val);
  }

  function readCompletedDates() {
    try {
      const raw = localStorage.getItem(COMPLETED_DATES_KEY);
      const arr = JSON.parse(raw || "[]");
      if (!Array.isArray(arr)) return [];

      return arr
        .map(normalizeDateKey)
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function writeCompletedDates(dates) {
    localStorage.setItem(COMPLETED_DATES_KEY, JSON.stringify(dates));
  }

  function pruneCompletedDatesTo30Days(dates) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

    return dates.filter((key) => {
      const parts = String(key || "").split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!y || !m || !d) return false;

      const itemUtc = Date.UTC(y, m - 1, d);
      const diffDays = Math.floor((todayUtc - itemUtc) / msPerDay);

      return diffDays >= 0 && diffDays < 30;
    });
  }

  function saveCompletedDate(dateKey) {
    const existing = readCompletedDates();
    const set = new Set(existing);
    set.add(dateKey);

    const cleaned = pruneCompletedDatesTo30Days(Array.from(set)).sort();
    writeCompletedDates(cleaned);

  }

  function playStreakSound() {
    try {
      const audio = new Audio("/sounds/streak-notification.mp3");
      audio.volume = 0.6;
      audio.play().catch((err) => {
      });
    } catch (err) {
    }
  }
  function renderStreak(val) {
    const el = (window.DOM && DOM.streakLine) || document.getElementById("streakLine");
    if (el) el.textContent = val > 0 ? val : "—";
  }

  // public hook (called when emotion is logged)
  window.incrementDailyStreak = function () {

    const today = todayKey();
    const lastDateStr = readLastDate();
    let streak = readStreak();

    function dayIndexFromKey(key) {
      const parts = String(key || "").split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!y || !m || !d) return null;

      const msPerDay = 24 * 60 * 60 * 1000;
      return Math.floor(Date.UTC(y, m - 1, d) / msPerDay);
    }

    const todayIdx = dayIndexFromKey(today);
    const lastIdx = lastDateStr ? dayIndexFromKey(lastDateStr) : null;

    let shouldPlayStreakSound = false;

    if (!lastDateStr || lastIdx === null || todayIdx === null) {
      streak = 1;
      shouldPlayStreakSound = true;
    } else if (lastDateStr === today) {
      saveCompletedDate(today);

      return;
    } else {
      const diffDays = todayIdx - lastIdx;

      if (diffDays === 1) {
        streak = (streak || 0) + 1;
        shouldPlayStreakSound = true;
      } else if (diffDays > 1) {
        streak = 1;
        shouldPlayStreakSound = true;
      } else {
        streak = 1;
        shouldPlayStreakSound = true;
      }
    }
    const longest = readLongest();
    if (streak > longest) writeLongest(streak);

    writeStreak(streak);
    writeLastDate(today);
    saveCompletedDate(today);

    if (shouldPlayStreakSound) {
      playStreakSound();
    }

    window.dispatchEvent(new Event("ig:emotionLogged"));
    igRenderWeeklyStreak();
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderStreak(readStreak());
  });
})();

// =========================
// Guest mode helpers (Top 3 UI + API guard)
// =========================

/**
 * Guest detection must NOT depend on user._id (guest has a 24-hex id).
 * Use:
 * - localStorage ig_auth_mode === "guest"
 * - OR user.isGuest === true
 */
function igIsGuestMode(user) {
  try {
    return localStorage.getItem("ig_auth_mode") === "guest" || user?.isGuest === true;
  } catch (e) {
    return user?.isGuest === true;
  }
}

/**
 * Guest mode: hide all Top 3 UI surfaces and clear footer chips.
 * Safe to call multiple times.
 */
function igHideTop3UI() {
  try {
    const top3Label = document.getElementById("top3FooterLabel");
    if (top3Label) top3Label.classList.add("hidden");
  } catch (e) { }

  try {
    const topWrap = document.getElementById("topEmotionsContainer");
    if (topWrap) topWrap.classList.add("hidden");
  } catch (e) { }

  try {
    const section = document.querySelector(".top-emotions-section");
    if (section) section.classList.add("hidden");
  } catch (e) { }

  try {
    if (window.DOM && DOM.top3Footer) {
      DOM.top3Footer.innerHTML = "";
    } else {
      const fallbackFooter = document.getElementById("top3Footer");
      if (fallbackFooter) fallbackFooter.innerHTML = "";
    }
  } catch (e) { }
}

function initLogout() {

  const logoutBtn =
    (window.DOM && DOM.logoutBtn) ||
    document.getElementById("logoutBtn");

  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch { }

    localStorage.clear();
    location.href = "login.html";
  });

}

function initStarHover() {
  const stars = document.querySelectorAll("#starRating .star");
  if (!stars.length) return;
  stars.forEach((star, index) => {
    star.addEventListener("mouseenter", () => {
      stars.forEach((s, i) => s.classList.toggle("hover", i <= index));
    });
    star.addEventListener("mouseleave", () => {
      stars.forEach((s) => s.classList.remove("hover"));
    });
  });
}

/**
 * Footer-only Top 3 chips.
 * (Carousel cards are handled in profile.emotions.js)
 */
async function loadTopEmotions() {
  const user = await getCurrentUser();
  if (!user?._id) return;

  // Guest guard: do not call /api/emotions/top at all.
  if (igIsGuestMode(user)) {
    igHideTop3UI();
    return;
  }

  const res = await apiFetch(`/api/emotions/top?userId=${encodeURIComponent(user._id)}`);
  if (!res.ok) return;

  const { topEmotions = [] } = await res.json();
  if (!window.DOM || !DOM.top3Footer) return;

  DOM.top3Footer.innerHTML = topEmotions
    .slice(0, 3)
    .map((e) => `<span class="top3-chip">${e.name || e.emotion || ""}</span>`)
    .join("");
}

/**
 * Main profile bootstrap.
 */
document.addEventListener("DOMContentLoaded", async () => {
  /*  // --- Theme safety: keep lotus background on profile ---
  try {
    const bg = document.querySelector(".theme-bg");
    if (bg && !bg.classList.contains("lotus-bg")) {
      bg.classList.add("lotus-bg");
    }
  } catch (e) {
    console.warn("[profile] theme init error:", e);
  }
 */
  // --- Support banner: always start hidden on load ---
  try {
    const b = document.getElementById("supportBanner");
    if (b) {
      b.classList.remove("show");
      b.classList.add("hidden");
    }
  } catch (e) {
    console.warn("[profile] support banner init error:", e);
  }

  // --- Theme pill: go to theme selector page ---
  try {
    const pill = document.getElementById("themeToggleButton");
    if (pill) {
      pill.addEventListener("click", () => {
        // relative path works best with your current setup
        location.href = "/theme.html";
      });
    }
  } catch (e) {
    // ignore
  }

  // --- guest trial validity flag ---
  let guestValid = false;
  try {
    if (typeof igIsGuestTrialActiveAndValid === "function") {
      guestValid = igIsGuestTrialActiveAndValid();
    }
  } catch (e) {
    console.warn("[profile] guest check failed:", e);
  }

  // --- get current user from local cache (may be thin / guest) ---
  const cachedUser = await getCurrentUser();
  let user = cachedUser || null;

  // Detect guest user from cached info
  let isGuest =
    !!user &&
    (user.isGuest === true || (user._id && String(user._id).startsWith("guest-")));

  // ------------------------------------------------------------
  // Guest normalization (frontend-only):
  // Backend 500s when userId=guest-... is sent.
  // For guests, force a stable 24-hex userId in localStorage.currentUserId,
  // and make cached user use that id with isGuest=true.
  // ------------------------------------------------------------
  try {
    if (isGuest) {
      const existing = String(localStorage.getItem("currentUserId") || "").trim();
      const is24Hex = /^[a-f0-9]{24}$/i.test(existing);

      const make24Hex = () => {
        const bytes = new Uint8Array(12); // 12 bytes => 24 hex chars
        if (window.crypto && typeof window.crypto.getRandomValues === "function") {
          window.crypto.getRandomValues(bytes);
        } else {
          for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      };

      const guestHex = is24Hex ? existing : make24Hex();

      // Persist stable guest id
      localStorage.setItem("currentUserId", guestHex);

      // Make sure "currentUser" uses the stable id (and stays marked as guest)
      user = user || {};
      user._id = guestHex;
      user.id = guestHex;
      user.isGuest = true;

      if (typeof setCachedUser === "function") setCachedUser(user);

    }
  } catch (e) {
    console.warn("[guest] normalization failed (non-fatal):", e);
  }

  // --- SAFE refresh from /api/me for real users only ---
  try {
    if (!isGuest && typeof apiFetch === "function") {
      const meRes = await apiFetch("/api/me");
      if (meRes && meRes.ok) {
        const serverUser = await meRes.json();
        if (serverUser) {
          if (serverUser.id && !serverUser._id) serverUser._id = serverUser.id;

          // Merge so we KEEP any richer local fields (like firstName)
          // if the server response is thinner.
          user = {
            ...(serverUser || {}),
            ...(cachedUser || {}),
          };

          // Re-evaluate guest flag based on server user (should be real user here)
          isGuest =
            !!user &&
            (user.isGuest === true || (user._id && String(user._id).startsWith("guest-")));
        }
      }
    }
  } catch (e) {
    console.warn("[profile] /api/me refresh failed (non-fatal):", e);
    // We fall back to cached user / guest trial below.
  }

  // --- hard auth gate: must be real user OR valid guest ---
  if (!user?._id && !guestValid) {
    location.href = "login.html";
    return;
  }

  // Cache merged user if we have one
  if (user?._id && typeof setCachedUser === "function") {
    try {
      setCachedUser(user);
    } catch (e) {
      console.warn("[profile] setCachedUser failed:", e);
    }
  }

  // Recompute final guest flag using the requested detection rules
  const finalIsGuest = igIsGuestMode(user) || isGuest;


  // Guest mode: hide ALL Top 3 UI (footer chips, label, carousel/section)
  if (finalIsGuest) {
    igHideTop3UI();
  }

  // --- expired guest modal: guest identity present but trial has lapsed ---
  if (finalIsGuest && !guestValid) {
    const modal = document.getElementById("guestExpiredModal");
    if (modal) {
      modal.style.display = "flex";
      document.body.classList.add("ig-guest-expired");

      function igDisableExpiredGuestAiButton() {
        const btn = document.getElementById("newAiBtn");
        if (!btn) return;
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        btn.title = "Create a free account to keep using AI-generated affirmations.";
      }
      igDisableExpiredGuestAiButton();
      setTimeout(igDisableExpiredGuestAiButton, 300);

      const createBtn = document.getElementById("guestExpiredCreateBtn");
      const laterBtn = document.getElementById("guestExpiredLaterBtn");
      if (createBtn) createBtn.addEventListener("click", function () {
        window.location.href = "/signup.html";
      });
      if (laterBtn) laterBtn.addEventListener("click", function () {
        modal.style.display = "none";
      });
    }
  }

  // --- greeting: prefer ig_display_name (from name.html) for everyone ---
  // - Guests: name.html saves ig_display_name
  // - Accounts: we still fallback to user fields if storage is empty
  // - Back-compat: if older pages wrote ig_name, we read it as a fallback

  let rawName = finalIsGuest ? (localStorage.getItem("ig_display_name") || "").trim() : "";

  if (!rawName) {
    rawName = (localStorage.getItem("ig_name") || "").trim(); // legacy fallback (safe to keep)
  }

  if (!rawName) {
    // If logged-in and we have user data, fallback to it
    if (!finalIsGuest && user) {
      const base =
        user.firstName ||
        user.name ||
        (user.email && user.email.split("@")[0]) ||
        "Friend";
      rawName = (base || "Friend").trim();
    } else {
      rawName = "Friend";
    }
  }

  // Keep your existing capitalization behavior
  const name =
    rawName && rawName.length ? rawName[0].toUpperCase() + rawName.slice(1) : "Friend";

  const now = new Date();
  const hour = now.getHours();
  let greet = "Hello";
  if (hour >= 5 && hour < 12) greet = "Good morning";
  else if (hour >= 12 && hour < 17) greet = "Good afternoon";
  else greet = "Good night"; // 17–24 and 0–5

  const opts = { weekday: "long", month: "short", day: "numeric" };
  const todayStr = now.toLocaleDateString(undefined, opts);

  const greetingEl = document.getElementById("greetingLine");
  const todayEl = document.getElementById("todayLine");

  if (greetingEl) greetingEl.textContent = `${greet}, ${name}!`;
  if (todayEl) todayEl.textContent = todayStr;

  // (Removed) Guest-only greying of "Top 3 emotions:" label
  // Guest mode now hides Top 3 UI entirely.

  // --- guest trial banner (only if guest + valid) ---
  try {
    const guestEl = document.getElementById("guestTrialLine");
    if (guestEl && typeof igGetGuestTrialInfo === "function") {
      const info = igGetGuestTrialInfo();

      if (info.isActive && info.isValid && info.expiresAt) {
        const nowMs = Date.now();
        const endMs = info.expiresAt;
        const msPerDay = 24 * 60 * 60 * 1000;
        let daysLeft = Math.ceil((endMs - nowMs) / msPerDay);
        if (daysLeft < 0) daysLeft = 0;

        const endLabel = new Date(info.expiresAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        let text = "";
        if (daysLeft === 0) {
          text = `Guest trial · ends today (${endLabel})`;
        } else if (daysLeft === 1) {
          text = `Guest trial · 1 day left (until ${endLabel})`;
        } else {
          text = `Guest trial · ${daysLeft} days left (until ${endLabel})`;
        }

        guestEl.textContent = text;
      } else if (guestEl) {
        guestEl.textContent = info.isActive ? "Guest trial expired" : "";
      }
    }
  } catch (_) {}

  // --- feature inits ---
  if (typeof initEmotionHandlers === "function") {
    initEmotionHandlers();
  }
  if (typeof initLogout === "function") initLogout();
  if (typeof initStarHover === "function") initStarHover();

  // Footer chips: guest mode now no-ops + hides UI; logged-in users unchanged
  loadTopEmotions(); // footer chips, carousel handled elsewhere
  igRenderWeeklyStreak();
  try {
    if (localStorage.getItem('ig_tour_done') !== '1') {
      setTimeout(startIgTour, 800);
    }
  } catch (_) {}
});
// =========================
// Weekly streak footer
// =========================

function igRenderWeeklyStreak() {
  const container = document.getElementById("igSupportDaysRow");
  if (!container) return;

  const COMPLETED_DATES_KEY = "ig-completed-checkin-dates";

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function readCompletedDates() {
    try {
      const raw = localStorage.getItem(COMPLETED_DATES_KEY);
      const arr = JSON.parse(raw || "[]");
      if (!Array.isArray(arr)) return [];

      return arr
        .map((key) => {
          const parts = String(key || "").split("-");
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);

          if (!y || !m || !d) return null;

          const mm = String(m).padStart(2, "0");
          const dd = String(d).padStart(2, "0");

          return `${y}-${mm}-${dd}`;
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  const completedDates = new Set(readCompletedDates());

  const today = new Date();
  const todayKey = dateKey(today);

  const circles = container.querySelectorAll(".ig-day-circle");

  circles.forEach((circle, i) => {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - (today.getDay() - i));

    const key = dateKey(checkDate);

    circle.classList.remove("complete", "today");
    circle.textContent = "";

    if (key === todayKey) {
      circle.classList.add("today");
    }

    if (completedDates.has(key)) {
      circle.classList.add("complete");
      circle.textContent = "✓";
    }
  });
}
// Build marker (cache-bust sanity)
(function setBuildMarker() {
  const BUILD_TAG = "build 2026-01-06-1";
  const el = document.getElementById("igBuildTag");
  if (el) el.textContent = BUILD_TAG;
}
)


  ();
