//
//  firstaffirmation.js
//
//  Created by Ritu Sharma on 1/9/26.
//
//
//  firstaffirmation.js
//
//  Created by Ritu Sharma on 1/9/26.
//

// public/js/firstaffirmation.js
"use strict";

(function () {
  function log(...args) {
    console.log("[firstaffirmation]", ...args);
  }

  // Emotions (remove lonely/overwhelmed; add focused/excited)
  const EMOTIONS = [
    "calm",
    "anxious",
    "sad",
    "angry",
    "tired",
    "stressed",
    "grateful",
    "hopeful",
    "focused",
    "excited",
  ];

  // Instant fallback affirmations
  const FALLBACK = {
    calm: "Stay here. You’re doing fine.",
    anxious: "You can take one small step and still move forward.",
    sad: "You don’t need to fix everything today. Just breathe.",
    angry: "Your feelings are valid. Choose the next action with clarity.",
    tired: "Rest counts. Slow progress still counts.",
    stressed: "Pick one task. Do it slowly. Then stop.",
    grateful: "Notice what’s working. Let that steady you.",
    hopeful: "Keep going. Small wins stack up.",
    focused: "Protect your attention. One clear action beats ten rushed ones.",
    excited: "Use that energy. Start with the smallest version and ship it.",
  };

  document.addEventListener("DOMContentLoaded", () => {
    log("loaded");

    // --- onboarding guard (kept) ---
    (function () {
      const params = new URLSearchParams(window.location.search);
      const nextFromUrl = (params.get("next") || "").trim();
      const next = nextFromUrl || "pathselection.html";

      const step = (localStorage.getItem("ig_onboarding_step") || "").trim();
      const onboardingInProgress = !!step && step !== "done" && step !== "complete";

      const remEnabled = localStorage.getItem("ig_reminders_enabled");
      const remindersNeverTouched = remEnabled === null;

      console.log("[firstaffirmation] guard v2026-01-11-2", {
        nextFromUrl,
        next,
        step,
        onboardingInProgress,
        remEnabled,
      });

      if (onboardingInProgress && remindersNeverTouched) {
        const target = "reminders.html?next=" + encodeURIComponent(next);
        console.log("[firstaffirmation] reminders missing -> redirect", target);
        window.location.replace(target);
      }
    })();

    // DOM
    const chipsHost = document.getElementById("faChips");
    const textEl = document.getElementById("faText");
    const btn = document.getElementById("firstContinue");

    // FIX: your HTML uses faAffSection (not faAffWrap)
    const affSection = document.getElementById("faAffSection");

    const congratsEl = document.getElementById("faCongrats");

    if (!chipsHost) log("ERROR: #faChips not found");
    if (!textEl) log("ERROR: #faText not found");
    if (!btn) log("ERROR: #firstContinue not found");
    if (!affSection) log("ERROR: #faAffSection not found");
    if (!congratsEl) log("ERROR: #faCongrats not found");

    // Render chips
    if (chipsHost) {
      chipsHost.innerHTML = EMOTIONS.map((e) => {
        return `<button type="button" class="emotion-chip" data-emotion="${e}">${e}</button>`;
      }).join("");
    }

    // Start hidden until the first emotion pick
    if (affSection) affSection.style.display = "none";
    if (congratsEl) congratsEl.style.display = "none";

    // Congrats should show only on the first emotion pick, then never again
    let firstPickDone = false;
    let congratsTimer = null;

    function hideCongrats() {
      if (congratsTimer) {
        window.clearTimeout(congratsTimer);
        congratsTimer = null;
      }
      if (congratsEl) congratsEl.style.display = "none";
    }

    // Tap-to-dismiss (only relevant for the first pick moment)
    if (congratsEl) {
      congratsEl.addEventListener("click", () => {
        hideCongrats();
      });
    }

    // Chip click handler
    if (chipsHost && textEl && affSection) {
      chipsHost.addEventListener("click", (evt) => {
        const b = evt.target.closest(".emotion-chip");
        if (!b) return;

        // Active styling
        chipsHost
          .querySelectorAll(".emotion-chip")
          .forEach((x) => x.classList.remove("emotion-chip--active"));
        b.classList.add("emotion-chip--active");

        const emotion = (b.dataset.emotion || "").trim();

        // Show the affirmation section
        affSection.style.display = "block";

        // Set affirmation text
        textEl.textContent = FALLBACK[emotion] || "You’re allowed to start small.";

        // Congrats behavior:
        // - show only on the first emotion pick
        // - hide immediately on any later emotion pick
        if (!firstPickDone) {
          firstPickDone = true;

          if (congratsEl) {
            congratsEl.style.display = "block";

            // Auto-hide after 2.5s
            hideCongrats();
            congratsEl.style.display = "block";
            congratsTimer = window.setTimeout(() => {
              hideCongrats();
            }, 2500);
          }
        } else {
          hideCongrats();
        }

        log("emotion picked:", emotion);
      });
    }

    // Continue routing (unchanged)
    if (btn) {
      const DEFAULT_NEXT = "pathselection.html";
      const qs = new URLSearchParams(window.location.search);
      const next = qs.get("next") || DEFAULT_NEXT;

      log("next =", next);

      btn.addEventListener("click", () => {
        log("clicked; routing to", next);
        window.location.href = next;
      });
    }
  });
})();
