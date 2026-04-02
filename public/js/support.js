// /public/js/support.js
"use strict";

(() => {
  // -----------------------------
  // Config
  // -----------------------------
  const API_BASE = "https://api.innerguideai.com";

  // Local fallback lines used when /api/me returns 401
  // or when the support API cannot return account data.
  const FALLBACK_LINES = [
    "Pause. Exhale once. You do not need to carry all of this at the same time.",
    "This moment is smaller than it feels. Take one step, not ten.",
    "Reset your shoulders. Reset your breath. Start again from here.",
    "You are allowed to steady yourself before you continue.",
    "One calm thought is enough to begin shifting this moment."
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
      id: params.get("id") || ""
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
  function renderFallbackLine(whyText = "Quick reset (guest mode)") {
    isFallbackMode = true;
    currentSupportItem = null;

    setText(supportStatusEl, "");
    setText(supportLineEl, getNextFallbackLine());
    setText(supportWhyEl, whyText);
    setStars(0);

    console.log("support.js: fallback line rendered");
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

    console.log("support.js: rendered line text =", line);
    console.log("support.js: support item rendered", item);
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
        meData?._id ||
        meData?.id ||
        null;

      console.log("support.js: resolved userId =", userId);
      return userId;
    } catch (error) {
      console.error("support.js: /api/me error, using fallback mode", error);
      return null;
    }
  }

  async function fetchDaytimeReset(userId, source) {
    if (!userId) return null;

    try {
      const fetchFn = getFetchFn();

      const url =
        `/api/support/daytime-reset?userId=${encodeURIComponent(userId)}` +
        `&source=${encodeURIComponent(source || "daytime")}`;

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
      console.log("support.js: next ignored (in flight)");
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

      console.log(
        "support.js: fetching next affirmation for",
        currentFeeling,
        "excluding",
        shownIds
      );

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
        console.log("support.js: no more saved affirmations for emotion", currentFeeling);
        renderFallbackLine(`No more saved lines for ${currentFeeling}. Try a quick reset instead.`);
        return;
      }

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : null;

      console.log("support.js: next raw response", res.status, data);

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
        console.log("support.js: next affirmation shown");
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
      console.log("support.js: hide in fallback/local mode");
      renderFallbackLine();
      return;
    }

    try {
      const affirmationId = getCurrentAffirmationId();

      if (!affirmationId) {
        console.log("support.js: no affirmationId found for hide; loading next line");
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
      console.log("support.js: hide raw response", res.status, txt.slice(0, 200));

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

    console.log("support.js: submitRating clicked", {
      value,
      parsedRating: rating,
      isFallbackMode,
      currentUserId,
      currentSupportItem
    });

    if (!rating) return;

    setStars(rating);

    if (isFallbackMode || !currentUserId || !currentSupportItem) {
      console.log("support.js: rating skipped in fallback mode", rating);
      return;
    }

    try {
      const affirmationId = getCurrentAffirmationId();

      console.log("support.js: submitRating affirmationId", affirmationId);

      if (!affirmationId) {
        console.log("support.js: no affirmationId found for rating");
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
      console.log("support.js: rating raw response", res.status, txt.slice(0, 200));

      if (!res.ok) {
        throw new Error(`/api/affirmations/rate failed ${res.status} ${txt}`);
      }

      console.log("support.js: rating saved", rating);
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

    setText(supportStatusEl, "Loading...");
    setText(supportWhyEl, "Finding your reset");
    setText(supportLineEl, "Loading…");

    currentUserId = await resolveCurrentUserId();

    if (!currentUserId) {
      renderFallbackLine();
      return;
    }

    const supportItem = await fetchDaytimeReset(currentUserId, params.source);

    if (!supportItem) {
      console.log("support.js: no support item returned, using fallback");
      renderFallbackLine();
      return;
    }

    renderSupportItem(supportItem);

    // Count this as a meaningful action for the daily streak
    if (typeof window.incrementDailyStreak === "function") {
      window.incrementDailyStreak();
      console.log("support.js: daily streak incremented from reset page");
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