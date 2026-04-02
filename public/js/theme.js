//
//  to.swift
//  
//
//  Created by Ritu Sharma on 12/19/25.
//


/* ig.theme.js
   Single source of truth for theme persistence + early apply.
*/
(function () {
  // Key used across the app.
  const THEME_KEY = "igSelectedTheme";

  // Only allow theme classes that match your naming convention.
  function isValidThemeClass(value) {
    return typeof value === "string" && /^ig-theme-[a-z0-9-]+$/i.test(value);
  }

  // Remove any existing ig-theme-* classes from <body>.
  function clearThemeClasses() {
    document.body.classList.forEach((cls) => {
      if (cls.startsWith("ig-theme-")) document.body.classList.remove(cls);
    });
  }

  // Apply a specific theme class to <body>.
  function applyTheme(themeClass) {
    if (!document.body) return;
    clearThemeClasses();
    if (isValidThemeClass(themeClass)) document.body.classList.add(themeClass);
  }

  // Persist theme choice.
  function saveTheme(themeClass) {
    if (!isValidThemeClass(themeClass)) return;
    localStorage.setItem(THEME_KEY, themeClass);
  }

  // Read saved theme.
  function getSavedTheme() {
    const v = localStorage.getItem(THEME_KEY);
    return isValidThemeClass(v) ? v : "";
  }

  // IMPORTANT: run this ASAP (in <head>) so the correct background loads on first paint.
  function applySavedThemeEarly() {
    // If body isn't available yet, wait for it.
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => applyTheme(getSavedTheme()), { once: true });
      return;
    }
    applyTheme(getSavedTheme());
  }

  // Expose minimal API
  window.IGTheme = {
    saveTheme,
    applyTheme,
    getSavedTheme,
    applySavedThemeEarly,
    THEME_KEY,
  };
})();
