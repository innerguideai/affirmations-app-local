// /public/js/theme.apply.js
// Apply saved theme + update theme pill label.
// Storage: ig_theme (stores ig-theme-* values)
// NO cycling. Theme pill navigates to theme.html.

(function () {
  "use strict";

  const STORAGE_KEY = "ig_theme";

  const THEMES = {
    "ig-theme-default": { label: "Default", bodyClass: "ig-theme-default" },
    "ig-theme-winter": { label: "Winter", bodyClass: "ig-theme-winter" },
    "ig-theme-spring": { label: "Spring", bodyClass: "ig-theme-spring" },
    "ig-theme-cblossom": { label: "Cherry Blossom", bodyClass: "ig-theme-cblossom" },
    "ig-theme-summer": { label: "Summer Beach", bodyClass: "ig-theme-summer" },
    "ig-theme-zen": { label: "Zen Garden", bodyClass: "ig-theme-zen" },
  };

  function readThemeValue() {
    try {
      const v = (localStorage.getItem(STORAGE_KEY) || "").trim();
      return THEMES[v] ? v : "ig-theme-default";
    } catch (e) {
      return "ig-theme-default";
    }
  }

  function writeThemeValue(value) {
    try {
      if (THEMES[value]) localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {}
  }

  function applyTheme() {
    const value = readThemeValue();
    const theme = THEMES[value];

    Object.values(THEMES).forEach((t) => document.body.classList.remove(t.bodyClass));
    document.body.classList.add(theme.bodyClass);

    const pill = document.getElementById("themeToggleButton");
    if (pill) pill.textContent = theme.label;

    // Keep <html> in sync for first paint rules (Option A)
    try {
      Object.keys(THEMES).forEach((k) => document.documentElement.classList.remove(k));
      document.documentElement.classList.add(value);
    } catch (e) {}

    console.log("[theme.apply] applied", {
      storedValue: value,
      bodyClassAdded: theme.bodyClass,
      bodyClassList: document.body.className,
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    const current = readThemeValue();
    writeThemeValue(current); // only sets default if missing/invalid
    applyTheme();
  });

  window.addEventListener("pageshow", applyTheme);

  window.igApplyTheme = applyTheme;
})();
