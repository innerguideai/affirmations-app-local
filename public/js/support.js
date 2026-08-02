// /public/js/support.js
"use strict";

(() => {
  // -----------------------------
  // Config
  // -----------------------------
  const API_BASE = "https://api-b.innerguideai.com";

  // Local fallback lines used when /api/me returns 401
  // or when the support API cannot return account data.
  const FALLBACK_LINES = [
    "Pause. Exhale once. You do not need to carry all of this at the same time.",
    "This moment is smaller than it feels. Take one step, not ten.",
    "Reset your shoulders. Reset your breath. Start again from here.",
    "You are allowed to steady yourself before you continue.",
    "One calm thought is enough to begin shifting this moment."
  ];

  const BEDTIME_AFFIRMATIONS = [
    "You did enough for today. Let your body rest.",
    "The day is complete. You can release what remains.",
    "Your mind can soften now; nothing needs solving tonight.",
    "Rest is safe. You do not have to earn it.",
    "You carried a lot today. Let it be lighter now.",
    "Breathe out the pressure. Tomorrow can wait.",
    "You are allowed to stop holding everything together.",
    "Let the noise settle. You are safe in this moment.",
    "Your work is done for today. Peace can begin.",
    "You can rest without fixing every unfinished thing.",
    "Release the stress you were never meant to keep.",
    "Let your body recover from what your mind carried.",
    "You are not behind. Tonight is for restoration.",
    "Close the day gently. You are held by rest."
  ];

  // -----------------------------
  // DOM
  // -----------------------------
  const supportStatusEl = document.getElementById("supportStatus");
  const supportLineEl = document.getElementById("supportLine");
  const supportWhyEl = document.getElementById("supportWhy");
  const btnHideLine = document.getElementById("btnHideLine");
  const btnNextLine = document.getElementById("btnNextLine");
  const starRatingEl = document.getElementById("starRating");

  // -----------------------------
  // State
  // -----------------------------
  let currentUserId = null;
  let currentSupportItem = null;
  let currentFallbackIndex = 0;
  let isFallbackMode = false;

  let currentFeeling = "";
  let shownIds = [];
  let nextInFlight = false;

  // -----------------------------
  // Helpers
  // -----------------------------
  function setText(el, value) {
    if (!el) return;
    el.textContent = value || "";
  }

  function getQueryParams() {
    const params = new URLSearchParams(window.location.search);

    return {
      source: params.get("source") || "daytime",
      id: params.get("id") || "",
      affirmationId: params.get("affirmationId") || "",
      bedtimeIndex: params.get("bedtimeIndex") || ""
    };
  }

  function getNextFallbackLine() {
    const line = FALLBACK_LINES[currentFallbackIndex % FALLBACK_LINES.length];
    currentFallbackIndex += 1;
    return line;
  }

  function getFetchFn() {
    if (typeof window.apiFetch === "function") {
      return window.apiFetch;
    }

    return async (path, options = {}) => {
      const isAbsolute = /^https?:\/\//i.test(path);
      const finalUrl = isAbsolute ? path : `${API_BASE}${path}`;

      return fetch(finalUrl, {
        credentials: "include",
        cache: "no-store",
        ...options
      });
    };
  }

  function getCurrentAffirmationId() {
    return (
      currentSupportItem?.affirmation?._id ||
      currentSupportItem?._id ||
      currentSupportItem?.id ||
      currentSupportItem?.supportId ||
      null
    );
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  function fallbackMessage() {
    return currentUserId ? "Quick reset" : "Quick reset (guest mode)";
  }

  function renderFallbackLine(whyText = "Quick reset (guest mode)") {
    isFallbackMode = true;
    currentSupportItem = null;

    setText(supportStatusEl, "");
    setText(supportLineEl, getNextFallbackLine());
    setText(supportWhyEl, whyText);
    setStars(0);

  }

  function renderBedtimeLine(indexParam) {
    isFallbackMode = false;
    currentSupportItem = null;

    const idx = parseInt(indexParam, 10);
    const safeIdx =
      Number.isFinite(idx) && idx >= 0 && idx < BEDTIME_AFFIRMATIONS.length
        ? idx
        : 0;
    const line = BEDTIME_AFFIRMATIONS[safeIdx];

    setText(supportStatusEl, "");
    setText(supportLineEl, line);
    setText(supportWhyEl, "");
    setStars(0);

    const subEl = document.querySelector(".welcome-sub");
    const hintEl = document.querySelector(".welcome-hint");
    if (subEl) subEl.textContent = "Evening wind-down";
    if (hintEl) hintEl.textContent = "One soft line. Let the day close.";
  }

  function renderSupportItem(item) {
    isFallbackMode = false;
    currentSupportItem = item || null;
    currentFeeling = item?.topEmotion || currentFeeling || "";

    const firstAffirmationId =
      item?.affirmation?._id ||
      item?._id ||
      item?.id ||
      null;

    if (firstAffirmationId && !shownIds.includes(firstAffirmationId)) {
      shownIds.push(firstAffirmationId);
    }

    const line =
      item?.affirmation?.text ||
      item?.line ||
      item?.text ||
      item?.message ||
      "Take one breath. Start again from here.";

    const why =
      item?.why ||
      item?.reason ||
      (item?.topEmotion
        ? `Based on your recurring emotion: ${item.topEmotion}`
        : "Based on what’s been showing up lately");

    const status = item?.status || "";

    setText(supportStatusEl, status);
    setText(supportLineEl, line);
    setText(supportWhyEl, why);

    const existingRating = Number(
      item?.affirmation?.rating ||
      item?.userRating ||
      item?.rating ||
      0
    );

    setStars(existingRating);

  }

  function setStars(value) {
    if (!starRatingEl) return;

    const stars = starRatingEl.querySelectorAll(".star");
    const rating = Number(value || 0);

    stars.forEach((star) => {
      const starValue = Number(star.getAttribute("data-v") || 0);

      star.classList.remove("active", "hover", "unselected");

      if (starValue <= rating) {
        star.classList.add("active");
        star.setAttribute("aria-pressed", "true");
      } else {
        star.classList.add("unselected");
        star.setAttribute("aria-pressed", "false");
      }
    });
  }

  // -----------------------------
  // API
  // -----------------------------
  async function resolveCurrentUserId() {
    try {
      const fetchFn = getFetchFn();

      const meRes = await fetchFn("/api/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });

      if (meRes.status === 401) {
        console.log("support.js: /api/me returned 401, using fallback mode");
        return null;
      }

      if (!meRes.ok) {
        throw new Error(`/api/me failed ${meRes.status}`);
      }

      const raw = ((await meRes.text()) || "").replace(/^\uFEFF/, "").trim();
      const meData = raw ? JSON.parse(raw) : null;

      const userId =
        meData?.user?._id ||
        meData?.user?.id ||
        meData?.user?.userId ||
        meData?._id ||
        meData?.id ||
        meData?.userId ||
        null;

      console.log("support.js: /api/me resolved", { status: meRes.status, meData, userId });

      return userId ? String(userId) : null;
    } catch (error) {
      console.error("support.js: /api/me error, using fallback mode", error);
      return null;
    }
  }

  async function fetchDaytimeReset(userId, source, affirmationId = "") {
    if (!userId) {
      console.warn("support.js: skipping daytime-reset fetch — no userId resolved");
      return null;
    }

    try {
      const fetchFn = getFetchFn();

      let url =
        `/api/support/daytime-reset?userId=${encodeURIComponent(userId)}` +
        `&source=${encodeURIComponent(source || "daytime")}`;

      if (affirmationId) {
        url += `&affirmationId=${encodeURIComponent(affirmationId)}`;
      }

      console.log("support.js: fetching daytime-reset", { url, userId, source, affirmationId });

      const res = await fetchFn(url, {
        method: "GET",
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`/api/support/daytime-reset failed ${res.status}`);
      }

      const raw = ((await res.text()) || "").replace(/^\uFEFF/, "").trim();
      const data = raw ? JSON.parse(raw) : null;

      return data?.data || data || null;
    } catch (error) {
      console.error("support.js: support API error", error);
      return null;
    }
  }

  async function getNextSupportAffirmation() {
    if (nextInFlight) {
      return;
    }

    nextInFlight = true;

    try {
      if (!currentFeeling) {
        console.warn("support.js: no currentFeeling; falling back to loadSupportLine()");
        await loadSupportLine();
        return;
      }

      if (!currentUserId) {
        console.warn("support.js: no currentUserId; falling back to loadSupportLine()");
        await loadSupportLine();
        return;
      }

      const fetchFn = getFetchFn();


      const res = await fetchFn("/api/affirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emotion: currentFeeling,
          userId: currentUserId,
          excludeIds: shownIds
        })
      });

      if (res.status === 404) {
          renderFallbackLine(`No more saved lines for ${currentFeeling}. Try a quick reset instead.`);
        return;
      }

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : null;


      if (!res.ok) {
        throw new Error(`/api/affirmations failed ${res.status} ${txt}`);
      }

      if (data?.affirmation?.text) {
        currentSupportItem = {
          ...currentSupportItem,
          affirmation: data.affirmation,
          topEmotion: currentFeeling
        };

        const nextId = data?.affirmation?._id || null;
        if (nextId && !shownIds.includes(nextId)) {
          shownIds.push(nextId);
        }

        renderSupportItem(currentSupportItem);
        } else {
        renderFallbackLine(`No more saved lines for ${currentFeeling}. Try a quick reset instead.`);
      }
    } catch (error) {
      console.error("support.js: getNextSupportAffirmation failed", error);
    } finally {
      setTimeout(() => {
        nextInFlight = false;
      }, 250);
    }
  }

  // -----------------------------
  // Actions
  // -----------------------------
  async function hideCurrentLine() {
    if (isFallbackMode || !currentUserId || !currentSupportItem) {
      renderFallbackLine(fallbackMessage());
      return;
    }

    try {
      const affirmationId = getCurrentAffirmationId();

      if (!affirmationId) {
          await loadSupportLine();
        return;
      }

      const fetchFn = getFetchFn();

      // Placeholder route until hide feature is finalized.
      const res = await fetchFn("/api/support/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          affirmationId
        })
      });

      const txt = await res.text();

      if (!res.ok) {
        throw new Error(`/api/support/hide failed ${res.status} ${txt}`);
      }

      await loadSupportLine();
    } catch (error) {
      console.error("support.js: hide failed", error);
      await loadSupportLine();
    }
  }

  async function submitRating(value) {
    const rating = Number(value || 0);


    if (!rating) return;

    setStars(rating);

    if (isFallbackMode || !currentUserId || !currentSupportItem) {
      return;
    }

    try {
      const affirmationId = getCurrentAffirmationId();


      if (!affirmationId) {
          return;
      }

      const fetchFn = getFetchFn();

      const res = await fetchFn("/api/affirmations/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          affirmationId,
          rating
        })
      });

      const txt = await res.text();

      if (!res.ok) {
        throw new Error(`/api/affirmations/rate failed ${res.status} ${txt}`);
      }

    } catch (error) {
      console.error("support.js: rating failed", error);
    }
  }

  // -----------------------------
  // Wiring
  // -----------------------------
  function wireStars() {
    if (!starRatingEl) return;

    const stars = starRatingEl.querySelectorAll(".star");

    stars.forEach((star) => {
      star.addEventListener("click", async () => {
        const value = Number(star.getAttribute("data-v") || 0);
        await submitRating(value);
      });
    });
  }

  function wireButtons() {
    if (btnNextLine) {
      btnNextLine.addEventListener("click", async () => {
        if (isFallbackMode) {
          renderFallbackLine();
          return;
        }

        setStars(0);
        await getNextSupportAffirmation();
      });
    }

    if (btnHideLine) {
      btnHideLine.addEventListener("click", async () => {
        await hideCurrentLine();
      });
    }
  }

  // -----------------------------
  // Main loader
  // -----------------------------
  async function loadSupportLine() {
    const params = getQueryParams();

    if (params.source === "bedtime") {
      renderBedtimeLine(params.bedtimeIndex);
      return;
    }

    setText(supportStatusEl, "Loading...");
    setText(supportWhyEl, "Finding your reset");
    setText(supportLineEl, "Loading…");

    currentUserId = await resolveCurrentUserId();

    if (!currentUserId) {
      renderFallbackLine(fallbackMessage());
      return;
    }

    // --- Insights path: render affirmation passed via sessionStorage ---
    // When arriving from the Insights "Practice" button with source=monthly_insight
    // and an affirmationId, the backend /api/support/daytime-reset does not handle
    // that source+affirmationId combination and returns 404. Instead we use the
    // affirmation object stored by emotion-dashboard.js at click time.
    if (params.source === "monthly_insight" && params.affirmationId) {
      let rendered = false;
      try {
        const raw = sessionStorage.getItem("ig_support_insight_affirmation");
        const stored = raw ? JSON.parse(raw) : null;
        if (stored && stored.affirmationId === params.affirmationId && stored.text) {
          console.log("support.js: rendering insight affirmation from sessionStorage", stored);
          renderSupportItem({
            affirmation: { _id: stored.affirmationId, text: stored.text },
            topEmotion: stored.emotion || "",
            why: [
              stored.emotion ? stored.emotion.charAt(0).toUpperCase() + stored.emotion.slice(1) : "",
              stored.reason
            ].filter(Boolean).join(" · ") || "Based on your monthly insight"
          });
          rendered = true;
        }
      } catch (e) {
        console.warn("support.js: could not read sessionStorage insight affirmation", e);
      }
      if (!rendered) {
        console.warn("support.js: sessionStorage miss for monthly_insight — falling back");
        renderFallbackLine(fallbackMessage());
      }
      return;
    }

const supportItem = await fetchDaytimeReset(
  currentUserId,
  params.source,
  params.affirmationId
);
    if (!supportItem) {
        renderFallbackLine(fallbackMessage());
      return;
    }

    renderSupportItem(supportItem);

    // Count this as a meaningful action for the daily streak
    if (typeof window.incrementDailyStreak === "function") {
      window.incrementDailyStreak();
      }

    // Re-render weekly streak circles if available
    if (typeof window.igRenderWeeklyStreak === "function") {
      window.igRenderWeeklyStreak();
    }
  }

  async function initSupportPage() {
    try {
      wireButtons();
      wireStars();
      await loadSupportLine();
    } catch (error) {
      console.error("support.js: fatal init error", error);
      renderFallbackLine();
    }
  }

  document.addEventListener("DOMContentLoaded", initSupportPage);
})();