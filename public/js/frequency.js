// public/js/frequency.js
"use strict";

(function () {
  function log(...args) {
    console.log("[frequency]", ...args);
  }

  function save(freq) {
    // keep your existing save() logic here
    localStorage.setItem("ig_frequency", String(freq || ""));
  }

  function setActiveButton(freq) {
    // keep your existing active-state logic here
    const buttons = document.querySelectorAll("[data-frequency]");
    buttons.forEach((b) => b.classList.remove("is-active"));
    const active = document.querySelector(`[data-frequency="${freq}"]`);
    if (active) active.classList.add("is-active");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll("[data-frequency]");
    log("buttons found:", buttons.length);

    buttons.forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        // 1) stop the browser’s default navigation (form submit / anchor href)
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();

        // 2) run your existing logic
        const freq = btn.getAttribute("data-frequency");
        log("clicked frequency =", freq);

        save(freq);
        setActiveButton(freq);

        // 3) go to reminders
        window.location.assign("reminders.html");
      });
    });
  });
})();
