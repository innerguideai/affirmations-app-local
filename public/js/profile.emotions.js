//
//  profile.emotions.js  (Carousel-only, no name conflicts)
//

"use strict";

/* ============================================================
   DEBUG MARKER
   ============================================================ */
console.log("[topEmotions] carousel file loaded (no global loadTopEmotions)");

/* ============================================================
   Guest check + UI hide helper (SAFE: no top-level return)
   ============================================================ */
function igIsGuestMode() {
  return String(localStorage.getItem("ig_auth_mode") || "guest")
    .toLowerCase() === "guest";
}

function igHideTopEmotionsUI() {
  // Hide the footer label + container so guest stays clean
  const lbl = document.getElementById("top3FooterLabel");
  if (lbl) lbl.classList.add("hidden");

  const container = document.getElementById("topEmotionsContainer");
  if (container) container.classList.add("hidden");

  const label = document.getElementById("topemotlabel");
  if (label) label.classList.add("hidden");

  const section = document.querySelector(".top-emotions-section");
  if (section) section.classList.add("hidden");
}

/* ============================================================
   Emotion Handlers (stable; "Other" works every time)
   ============================================================ */
function initEmotionHandlers() {
  // Prevent duplicate bindings (common in iOS rebuilds / hot reloads)
  if (window.__igEmotionHandlersBound) return;
  window.__igEmotionHandlersBound = true;

  const chips = document.querySelectorAll(".emotion-chip");
  if (!chips || !chips.length) return;

  if (!window.DOM) return;
  const DOM = window.DOM;

  // --- helpers ---
  function setActiveChip(activeEl) {
    chips.forEach((c) => c.classList.remove("emotion-chip--active"));
    if (activeEl) activeEl.classList.add("emotion-chip--active");
  }

  function clearAffirmationTextOnly() {
    if (!DOM.affirmationCard) return;

    // Prefer dedicated container if present
    const txt = DOM.affirmationCard.querySelector("#affirmationText");
    if (txt) txt.textContent = "";

    // Also clear any stray text nodes (from older innerText usage)
    Array.from(DOM.affirmationCard.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) n.textContent = "";
    });
  }

  function hideAffirmationActions() {
    if (DOM.starRating) DOM.starRating.classList.add("hidden");
    if (DOM.nextBtn) DOM.nextBtn.classList.add("hidden");
    if (DOM.newAiBtn) DOM.newAiBtn.classList.add("hidden");
  }

  function showOtherUI() {
    // Show the other block + remove hidden so input is clickable
    if (DOM.otherFeelingBlock) {
      DOM.otherFeelingBlock.classList.remove("hidden");
      DOM.otherFeelingBlock.style.display = "block";
    }

    if (DOM.otherEmotionRow) DOM.otherEmotionRow.classList.remove("hidden");

    // Always reset typed value when entering Other
    if (DOM.otherEmotionInput) {
      DOM.otherEmotionInput.value = "";
      DOM.otherEmotionInput.removeAttribute("disabled");
      DOM.otherEmotionInput.removeAttribute("readonly");
      DOM.otherEmotionInput.style.pointerEvents = "auto";
    }

    // Hide submit until the user types
    if (DOM.submitEmotion) {
      DOM.submitEmotion.classList.add("hidden");

      // Stop the "circle button" behavior (one-time hardening)
      if (!DOM.submitEmotion.dataset.igPillFixed) {
        DOM.submitEmotion.dataset.igPillFixed = "1";
        DOM.submitEmotion.style.width = "auto";
        DOM.submitEmotion.style.height = "auto";
        DOM.submitEmotion.style.whiteSpace = "nowrap";
        DOM.submitEmotion.style.borderRadius = "999px";
        DOM.submitEmotion.style.padding = "10px 14px";
        DOM.submitEmotion.style.display = "inline-flex";
        DOM.submitEmotion.style.alignItems = "center";
        DOM.submitEmotion.style.justifyContent = "center";
      }
    }

    // While typing "Other", hide the rating + Next buttons
    hideAffirmationActions();

    // Hide the affirmation card itself so we don't show an empty white box
    if (DOM.affirmationCard) DOM.affirmationCard.style.display = "none";

    // Clear only the affirmation text (keep card structure)
    clearAffirmationTextOnly();

    // iOS WebView: focus works best after paint
    if (DOM.otherEmotionInput) {
      setTimeout(() => DOM.otherEmotionInput.focus(), 0);
    }
  }

  function hideOtherUI() {
    // Hide everything and clear typed value so it never “sticks”
    if (DOM.otherEmotionInput) DOM.otherEmotionInput.value = "";

    if (DOM.submitEmotion) DOM.submitEmotion.classList.add("hidden");
    if (DOM.otherEmotionRow) DOM.otherEmotionRow.classList.add("hidden");

    if (DOM.otherFeelingBlock) {
      DOM.otherFeelingBlock.classList.add("hidden");
      DOM.otherFeelingBlock.style.display = "none";
    }
  }

  // --- click handlers for every chip (no event delegation) ---
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {

      // Reset context when a new emotion is selected
      window.contextDriver = null;
      window.contextPressure = null;
      console.log("Context reset for new emotion");

      const emotion = chip.dataset && chip.dataset.emotion ? chip.dataset.emotion : "";
      if (!emotion) return;

      // highlight selected emotion
      setActiveChip(chip);

      if (emotion === "other") {
        showOtherUI();
        return;
      }

      // Switching away from Other -> fully reset Other UI
      //  hideOtherUI();

      // Set feeling and fetch
      //     if (DOM.feelingInput) DOM.feelingInput.value = emotion;
      //     if (typeof fetchAffirmations === "function") fetchAffirmations();
      if (DOM.feelingInput) DOM.feelingInput.value = emotion;

      // TEST: fetch first context question
      getContextQuestion(emotion, 1).then(data => {
        console.log("Context Question:", data);
        console.log("[emotion] about to call showContextQuestion", {
          emotion,
          hasQuestion: !!data?.question,
          optionCount: Array.isArray(data?.options) ? data.options.length : "n/a"
        });
        if (typeof showContextQuestion === "function") {
          showContextQuestion(emotion, data, 1);
        }
      });

      // keep affirmation call for now
      //if (typeof fetchAffirmations === "function") fetchAffirmations();
    });
  });

  // --- show submit only once the user types ---
  if (DOM.otherEmotionInput) {
    DOM.otherEmotionInput.addEventListener("input", () => {
      const hasText = DOM.otherEmotionInput.value.trim().length > 0;
      if (DOM.submitEmotion) DOM.submitEmotion.classList.toggle("hidden", !hasText);
    });
  }

  // --- submit typed emotion ---
  if (DOM.submitEmotion) {
    DOM.submitEmotion.addEventListener("click", () => {
      console.log("Submit button clicked");
      const typed = (DOM.otherEmotionInput ? DOM.otherEmotionInput.value : "").trim();
      if (!typed) return;

      // Log (already added)
      console.log("Emotion selected:", typed);

      // Reset context
      window.contextDriver = null;
      window.contextPressure = null;
      console.log("Context reset for new emotion");

      // Close Other UI
      hideOtherUI();

      // Show affirmation card
      if (DOM.affirmationCard) DOM.affirmationCard.style.display = "";

      // Set feeling (IMPORTANT — this feeds backend)
      if (DOM.feelingInput) DOM.feelingInput.value = typed;

      // For "Other" → use the same context entry path as preset emotions
      getContextQuestion(typed, 1).then((data) => {
        console.log("Context Question (Other):", data);

        if (typeof showContextQuestion === "function") {
          showContextQuestion(typed, data, 1);
        }
      });
    });
  }
}

/* ============================================================
   Simple indicators for carousel
   ============================================================ */
function updateCarouselIndicators() {
  const carousel = document.getElementById("carousel");
  const indicatorContainer = document.getElementById("carouselIndicators");
  if (!carousel || !indicatorContainer) return;

  const cards = Array.from(carousel.querySelectorAll(".carousel-card"));
  indicatorContainer.innerHTML = "";
  if (!cards.length) return;

  cards.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "dot" + (i === 0 ? " active" : "");
    indicatorContainer.appendChild(dot);
  });
}

/* ============================================================
   NEW NAME: loadTopEmotionsCarousel (no conflict) – REAL DATA
   ============================================================ */
async function loadTopEmotionsCarousel() {
  console.log("[topEmotions] carousel: entered loadTopEmotionsCarousel()");

  // Guest: hide + skip cleanly
  if (igIsGuestMode()) {
    igHideTopEmotionsUI();
    return;
  }

  const container = document.getElementById("topEmotionsContainer");
  const label = document.getElementById("topemotlabel");
  const carousel = document.getElementById("carousel");
  const indicators = document.getElementById("carouselIndicators");

  console.log("[topEmotions] carousel: DOM nodes:", {
    container: !!container,
    label: !!label,
    carousel: !!carousel,
    indicators: !!indicators
  });

  if (!container || !carousel || !indicators) {
    console.log("[topEmotions] carousel: missing DOM nodes, abort.");
    return;
  }

  // Reset UI (for carousel only)
  container.classList.add("hidden");
  // keep label hidden always; footer owns the “Top 3 emotions” text
  if (label) label.classList.add("hidden");
  carousel.innerHTML = "";
  indicators.innerHTML = "";

  // --- fetch real top emotions for this user ---
  if (typeof getCurrentUser !== "function" || typeof apiFetch !== "function") {
    console.warn("[topEmotions] carousel: helpers not ready (getCurrentUser/apiFetch)");
    return;
  }

  const user = await getCurrentUser();
  if (!user || !user._id) {
    console.log("[topEmotions] carousel: no user id, skipping");
    return;
  }

  console.log("[topEmotions] carousel: fetching /api/emotions/top for user", user._id);

  const res = await apiFetch(`/api/emotions/top?userId=${encodeURIComponent(user._id)}`);
  if (!res.ok) {
    console.warn("[topEmotions] carousel: topEmotions request failed:", res.status);
    return;
  }

  const data = await res.json();
  console.log("[topEmotions] carousel: raw API data:", data);

  let topEmotions = [];

  if (Array.isArray(data.topEmotions)) {
    topEmotions = data.topEmotions;
  } else if (Array.isArray(data.top_emotions)) {
    topEmotions = data.top_emotions;
  } else if (Array.isArray(data)) {
    topEmotions = data;
  }

  console.log("[topEmotions] carousel: normalized topEmotions:", topEmotions);

  if (!topEmotions.length) {
    console.log("[topEmotions] carousel: no emotions from API, abort.");
    return;
  }

  // Unhide section (label stays hidden – footer owns the wording)
  const topSection = document.querySelector(".top-emotions-section");
  if (topSection) topSection.classList.remove("hidden");
  container.classList.remove("hidden");

  // Render cards
  for (const item of topEmotions) {
    const emotion = item.emotion || item.name;
    if (!emotion) continue;

    const card = document.createElement("div");
    card.className = "carousel-card";

    const emotionLabel = document.createElement("div");
    emotionLabel.className = "emotion-label";
    emotionLabel.textContent = emotion.charAt(0).toUpperCase() + emotion.slice(1);

    const stars = document.createElement("div");
    stars.className = "stars";

    const countValue = typeof item.count === "number" ? item.count : null;

    if (countValue == null) {
      stars.textContent = "⭐️ count: N/A";
    } else {
      const suffix = countValue === 1 ? "time" : "times";
      stars.textContent = `⭐️ seen ${countValue} ${suffix}`;
    }

    card.appendChild(emotionLabel);
    card.appendChild(stars);

    // highlight on tap
    card.addEventListener("click", () => {
      document.querySelectorAll(".carousel-card")
        .forEach((el) => el.classList.remove("highlight"));
      card.classList.add("highlight");
    });

    carousel.appendChild(card);
  }

  console.log(
    "[topEmotions] carousel: cards in DOM after render:",
    document.querySelectorAll(".carousel-card").length
  );

  updateCarouselIndicators();
}

window.addEventListener("ig:emotionLogged", async () => {
  /* Refresh Top 3 only for logged-in users. */
  if (igIsGuestMode()) {
    igHideTopEmotionsUI();
    return;
  }

  /* Re-fetch + re-render carousel using the existing function. */
  await loadTopEmotionsCarousel();
});
/* ============================================================
   Top 3 emotions auto-refresh (activity + light cadence, no constant polling)
   ============================================================ */

/* Keep the timer id on window so it survives script ordering and avoids duplicates. */
window.__igTopEmotionsRefreshTimerId = window.__igTopEmotionsRefreshTimerId || null;

/* Light cadence: 5 minutes (adjust if you want). */
window.__igTopEmotionsRefreshEveryMs = 5 * 60 * 1000;

/* Safe refresh wrapper so errors never break profile. */
async function igRefreshTopEmotionsCarouselSafely(reason) {
  try {
    console.log("[topEmotions] auto-refresh:", reason);

    /* Guest stays hidden. */
    if (igIsGuestMode()) {
      igHideTopEmotionsUI();
      return;
    }

    /* Only refresh if the page is visible (prevents background work). */
    if (document.visibilityState !== "visible") {
      console.log("[topEmotions] auto-refresh: skipped (page hidden)");
      return;
    }

    /* Use the existing function in THIS file. */
    if (typeof loadTopEmotionsCarousel !== "function") {
      console.warn("[topEmotions] auto-refresh: loadTopEmotionsCarousel not available");
      return;
    }

    await loadTopEmotionsCarousel();
  } catch (err) {
    console.warn("[topEmotions] auto-refresh: failed:", err);
  }
}

/* Start the light cadence only while visible. */
function igStartTopEmotionsAutoRefresh() {
  /* Avoid duplicates. */
  if (window.__igTopEmotionsRefreshTimerId) return;

  /* Only start if visible. */
  if (document.visibilityState !== "visible") return;

  window.__igTopEmotionsRefreshTimerId = setInterval(() => {
    igRefreshTopEmotionsCarouselSafely("cadence");
  }, window.__igTopEmotionsRefreshEveryMs);

  console.log("[topEmotions] auto-refresh: cadence started");
}

/* Stop cadence when hidden. */
function igStopTopEmotionsAutoRefresh() {
  if (!window.__igTopEmotionsRefreshTimerId) return;

  clearInterval(window.__igTopEmotionsRefreshTimerId);
  window.__igTopEmotionsRefreshTimerId = null;

  console.log("[topEmotions] auto-refresh: cadence stopped");
}

/* 1) Refresh when the app logs a new emotion (activity-based). */
window.addEventListener("ig:emotionLogged", () => {
  igRefreshTopEmotionsCarouselSafely("activity (emotion logged)");
});

/* 2) Refresh when the user returns to the tab/app, and manage cadence. */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    igRefreshTopEmotionsCarouselSafely("visibility return");
    igStartTopEmotionsAutoRefresh();
  } else {
    igStopTopEmotionsAutoRefresh();
  }
});

/* 3) Start cadence on load (profile open). */
document.addEventListener("DOMContentLoaded", () => {
  /* Start cadence (loadTopEmotionsCarousel already runs via your boot logic). */
  igStartTopEmotionsAutoRefresh();
});
/* ============================================================
   Auto-run Top Emotions (retry until user is ready)
   ============================================================ */
window.initEmotionHandlers = initEmotionHandlers;

document.addEventListener("DOMContentLoaded", () => {
  // Prevent double-runs if scripts get evaluated twice
  if (window.__igTopEmotionsBooted) return;
  window.__igTopEmotionsBooted = true;

  // Guest: hide + do nothing else
  if (igIsGuestMode()) {
    console.log("[topEmotions] boot: guest mode → hide + skip");
    igHideTopEmotionsUI();
    return;
  }

  console.log("[topEmotions] boot: DOMContentLoaded → waiting for user, then loading carousel");

  const MAX_ATTEMPTS = 12;      // 12 * 250ms = ~3s
  const RETRY_MS = 250;

  async function bootTopEmotions(attempt) {
    try {
      if (typeof window.getCurrentUser !== "function") {
        throw new Error("getCurrentUser not ready");
      }
      if (typeof window.loadTopEmotionsCarousel !== "function") {
        throw new Error("loadTopEmotionsCarousel not ready");
      }

      const user = await window.getCurrentUser();
      if (!user || !user._id) {
        throw new Error("user not ready");
      }

      console.log("[topEmotions] boot: user ready:", user._id, "→ loading carousel");
      await window.loadTopEmotionsCarousel();
      console.log("[topEmotions] boot: carousel loaded");
      return;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) {
        console.warn("[topEmotions] boot: giving up after retries:", String(err && err.message ? err.message : err));
        return;
      }
      setTimeout(() => bootTopEmotions(attempt + 1), RETRY_MS);
    }
  }

  bootTopEmotions(0);
});

/* --- AI pill: open "Other" input (reuses existing flow; no new logic) --- */
(function wireAiPillToOther() {
  const aiPillBtn = document.getElementById("aiPillBtn");
  if (!aiPillBtn) return;

  aiPillBtn.addEventListener("click", () => {
    const otherChip = document.querySelector('[data-emotion="other"]');
    if (otherChip) {
      otherChip.click();
      return;
    }
    const otherInput = document.getElementById("otherEmotionInput");
    if (otherInput) otherInput.focus();
  });
  // Fallback: bind emotion handlers even if profile.init.js doesn't reach initEmotionHandlers()
  // Safe on iOS + Android because initEmotionHandlers is idempotent (guarded).
  document.addEventListener("DOMContentLoaded", () => {
    try {
      initEmotionHandlers();
    } catch (e) {
      console.log("[profile.emotions] initEmotionHandlers fallback failed:", e);
    }
  });
})();
