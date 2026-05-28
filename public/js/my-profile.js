// /js/my-profile.js
// F-0250 Editable profile
// - Uses /api/me as the source of truth for logged-in account users
// - Blocks guests and users with no cached account markers
"use strict";

(function () {
  var currentUser = null;
  var isSaving = false;

  function log() {
    try { console.log("[my-profile]", ...arguments); } catch (_) {}
  }

  function $(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (!el) return;
    el.hidden = false;
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
  }

  function setText(id, value) {
    var el = $(id);
    if (!el) return;
    var text = value === null || value === undefined ? "" : String(value).trim();
    el.textContent = text || "-";
  }

  function setStatus(message, kind) {
    var el = $("editStatusLine");
    if (!el) return;
    var text = message ? String(message) : "";
    el.textContent = text;
    el.style.color = kind === "error" ? "#7f1d1d" : "";
    if (text) show(el);
    else hide(el);
  }

  function setLoadingStatus(message) {
    var el = $("statusLine");
    if (!el) return;
    el.textContent = message || "";
    if (message) show(el);
    else hide(el);
  }

  function safeParse(json) {
    try { return JSON.parse(json); } catch (_) { return null; }
  }

  function isGuestUser(u) {
    try {
      if (u && u.isGuest === true) return true;
      if (u && u.role) return String(u.role).toLowerCase() === "guest";
      if (localStorage.getItem("ig_auth_mode") === "guest") return true;
      if (localStorage.getItem("ig_is_guest") === "true") return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function getCachedUser() {
    var raw = null;
    try { raw = localStorage.getItem("currentUser"); } catch (_) {}

    var user = raw ? safeParse(raw) : null;
    if (user && user.id && !user._id) user._id = user.id;

    var id = null;
    try { id = localStorage.getItem("currentUserId"); } catch (_) {}
    if (!user && id) user = { _id: id };

    return user;
  }

  function hasLocalAccountMarkers() {
    try {
      var user = getCachedUser();
      if (!user) return false;
      if (isGuestUser(user)) return false;

      var mode = localStorage.getItem("ig_auth_mode") || "";
      var hasToken = !!localStorage.getItem("authToken");
      var hasUserJson = !!localStorage.getItem("currentUser");
      var hasUserId = !!localStorage.getItem("currentUserId");
      var hasId = !!(user._id || user.id);

      return mode === "account" || hasToken || hasUserJson || hasUserId || hasId;
    } catch (_) {
      return false;
    }
  }

  function normalizeUser(user) {
    if (!user || typeof user !== "object") return null;
    if (user.id && !user._id) user._id = user.id;
    return user;
  }

  function cacheUser(user) {
    if (!user) return;
    try {
      localStorage.setItem("currentUser", JSON.stringify(user));
      localStorage.setItem("currentUserId", user._id || user.id || "");
    } catch (_) {}
  }

  function readDob(user) {
    return String((user && (user.dob || user.dateOfBirth)) || "").trim();
  }

  function dateInputValue(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    var date = new Date(raw);
    if (isNaN(date.getTime())) return "";

    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function displayDob(value) {
    var raw = String(value || "").trim();
    if (!raw) return "Not set";

    var inputValue = dateInputValue(raw);
    var date = inputValue ? new Date(inputValue + "T00:00:00") : new Date(raw);
    if (isNaN(date.getTime())) return raw;

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  }

  function renderProfile(user) {
    currentUser = normalizeUser(user);
    if (!currentUser) return;

    setText("emailVal", currentUser.email);
    setText("firstNameVal", currentUser.firstName);
    setText("lastNameVal", currentUser.lastName);
    setText("dobVal", displayDob(readDob(currentUser)));
    setText("genderVal", currentUser.gender || "Not set");
    setText("editEmailVal", currentUser.email);
  }

  function populateEditForm(user) {
    var firstName = $("editFirstName");
    var lastName = $("editLastName");
    var dob = $("editDob");
    var gender = $("editGender");

    if (firstName) firstName.value = String((user && user.firstName) || "");
    if (lastName) lastName.value = String((user && user.lastName) || "");
    if (dob) dob.value = dateInputValue(readDob(user));
    if (gender) gender.value = String((user && user.gender) || "Prefer not to say");
    setText("editEmailVal", user && user.email);
  }

  function setEditMode(isEditing) {
    var readOnly = $("profileReadOnly");
    var form = $("editProfileForm");

    if (isEditing) {
      populateEditForm(currentUser);
      hide(readOnly);
      show(form);
      setStatus("", "");
      var firstName = $("editFirstName");
      if (firstName) firstName.focus();
      return;
    }

    hide(form);
    show(readOnly);
  }

  function setSaving(nextIsSaving) {
    isSaving = !!nextIsSaving;
    var saveBtn = $("saveProfileBtn");
    var cancelBtn = $("cancelProfileBtn");
    var editBtn = $("editProfileBtn");

    if (saveBtn) {
      saveBtn.disabled = isSaving;
      saveBtn.textContent = isSaving ? "Saving..." : "Save";
    }
    if (cancelBtn) cancelBtn.disabled = isSaving;
    if (editBtn) editBtn.disabled = isSaving;
  }

  function goLogin() {
    try { window.location.replace("/login.html"); } catch (_) { window.location.href = "/login.html"; }
  }

  function goBack() {
    try {
      if (window.history && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch (_) {}
    window.location.href = "/account.html";
  }

  async function fetchFreshUser() {
    if (typeof window.apiFetch !== "function") {
      throw new Error("apiFetch unavailable");
    }

    var response = await window.apiFetch("/api/me", { method: "GET" });
    if (!response.ok) {
      var text = await response.text();
      throw new Error("/api/me failed " + response.status + ": " + text);
    }

    return normalizeUser(await response.json());
  }

  function collectPayload() {
    return {
      firstName: String(($("editFirstName") && $("editFirstName").value) || "").trim(),
      lastName: String(($("editLastName") && $("editLastName").value) || "").trim(),
      dob: String(($("editDob") && $("editDob").value) || "").trim(),
      gender: String(($("editGender") && $("editGender").value) || "Prefer not to say").trim()
    };
  }

  async function saveProfile() {
    if (isSaving) return;
    if (!currentUser || isGuestUser(currentUser)) {
      setStatus("Sign in required.", "error");
      return;
    }

    var payload = collectPayload();
    if (!payload.firstName || !payload.lastName) {
      setStatus("First and last name are required.", "error");
      return;
    }

    try {
      setSaving(true);
      setStatus("Saving...", "");

      var response = await window.apiFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      });

      var text = await response.text();
      var data = text ? safeParse(text) : null;

      if (!response.ok) {
        var message = data && (data.message || data.error) ? data.message || data.error : "Could not save profile.";
        setStatus(message, "error");
        return;
      }

      var updatedUser = normalizeUser(data || {});
      cacheUser(updatedUser);

      if (payload.firstName) {
        try { localStorage.setItem("ig_display_name", payload.firstName); } catch (_) {}
      }

      renderProfile(updatedUser);
      setEditMode(false);
      setStatus("Profile updated.", "success");
      log("saved profile");
    } catch (error) {
      log("save failed:", error);
      setStatus("Could not save profile. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    log("loaded");

    var authGateCard = $("authGateCard");
    var profileCard = $("profileCard");

    var backBtn = $("backBtn");
    if (backBtn) backBtn.addEventListener("click", function (e) { e.preventDefault(); goBack(); });

    var goLoginBtn = $("goLoginBtn");
    if (goLoginBtn) goLoginBtn.addEventListener("click", function (e) { e.preventDefault(); goLogin(); });

    var editBtn = $("editProfileBtn");
    if (editBtn) {
      editBtn.addEventListener("click", function () {
        if (!currentUser || isGuestUser(currentUser)) return;
        setEditMode(true);
      });
    }

    var cancelBtn = $("cancelProfileBtn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (isSaving) return;
        setEditMode(false);
        setStatus("", "");
      });
    }

    var form = $("editProfileForm");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        saveProfile();
      });
    }

    setLoadingStatus("Loading...");

    if (!hasLocalAccountMarkers()) {
      log("gate: not logged in locally");
      hide(profileCard);
      show(authGateCard);
      setLoadingStatus("Sign in required.");
      return;
    }

    var cachedUser = getCachedUser();
    if (isGuestUser(cachedUser)) {
      log("gate: guest user blocked");
      hide(profileCard);
      show(authGateCard);
      setLoadingStatus("Sign in required.");
      return;
    }

    try {
      var freshUser = await fetchFreshUser();
      if (!freshUser || isGuestUser(freshUser)) {
        throw new Error("not an account user");
      }

      cacheUser(freshUser);
      renderProfile(freshUser);
      hide(authGateCard);
      show(profileCard);
      setEditMode(false);
      setLoadingStatus("");
      log("rendered from /api/me");
    } catch (error) {
      log("api/me error:", error);
      goLogin();
    }
  });
})();
