// /public/js/signup.js
// Version: v2026-03-31-1
const API = "https://api-b.innerguideai.com";

document.addEventListener("DOMContentLoaded", () => {

  // Frame-buster: if signup.html is inside success.html (or any iframe), escape to top
  if (window.top && window.top !== window) {
    window.top.location.replace(window.location.href);
    return;
  }

  const form = document.getElementById("signupForm");
  const status = document.getElementById("signupStatus");
  const dobEl = document.getElementById("dob");

  const setStatus = (msg, color = "red") => {
    if (status) {
      status.textContent = msg;
      status.style.color = color;
    } else {
    }
  };

  if (!form) {
    console.error("signup.js: #signupForm not found");
    return;
  }

  // Prevent HTML-driven redirects/fights
  form.removeAttribute("action");
  form.setAttribute("novalidate", "true");

  // Email validation helper
  const isValidEmail = (email) => {
    const e = String(email || "").trim().toLowerCase();

    // basic shape
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return false;

    const parts = e.split("@");
    if (parts.length !== 2) return false;

    const domain = parts[1];

    // blocked typo domains for this release fix
    const blockedDomains = new Set([
      "gmail.co",
      "yahoo.co",
      "outlook.co",
      "hotmail.co",
      "icloud.co"
    ]);

    if (blockedDomains.has(domain)) return false;

    return true;
  };

  // DOB fix: some platforms auto-fill today's date when user tabs over an empty date input
  let dobValueOnFocus = "";
  let dobHadExplicitInteraction = false;

  function getTodayLocalISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (dobEl) {
    dobEl.addEventListener("focus", () => {
      dobValueOnFocus = dobEl.value || "";
      dobHadExplicitInteraction = false;
    });

    dobEl.addEventListener("pointerdown", () => {
      dobHadExplicitInteraction = true;
    });

    dobEl.addEventListener("touchstart", () => {
      dobHadExplicitInteraction = true;
    });

    dobEl.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" && e.key !== "Shift") {
        dobHadExplicitInteraction = true;
      }
    });

    dobEl.addEventListener("change", () => {
    });

    dobEl.addEventListener("blur", () => {
      const today = getTodayLocalISO();

      if (
        dobValueOnFocus === "" &&
        !dobHadExplicitInteraction &&
        dobEl.value === today
      ) {
        dobEl.value = "";
      }

    });
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Gather inputs
    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const dob = document.getElementById("dob").value;
    const gender = document.getElementById("gender").value;

    // Email validation
    if (!isValidEmail(email)) {
      setStatus("Please enter a valid email address.");
      return;
    }


    // Required fields
    if (!firstName || !lastName || !email || !password) {
      setStatus("Please fill in all required fields.");
      return;
    }

    // Password rules
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (!/[0-9]/.test(password)) {
      setStatus("Password must include at least one number.");
      return;
    }

    if (!/[^\w\s]/.test(password)) {
      setStatus("Password must include at least one special character.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    try {
      setStatus("Creating your account...", "black");

      const res = await fetch(`${API}/api/register`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ firstName, lastName, email, password, dob, gender }),
      });

      let data = null;
      try {
        data = await res.clone().json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        setStatus(data?.message || "Registration failed.");
        return;
      }

      // Success

      try {
        localStorage.setItem("signupEmail", email);
      } catch (e) {
        console.warn("Could not write to localStorage", e);
      }

      setStatus("Success! Redirecting…", "green");

      const next = `/verify-required.html?email=${encodeURIComponent(email)}`;

      if (window.top && window.top !== window) {
        window.top.location.replace(next);
      } else {
        window.location.replace(next);
      }
    } catch (err) {
      console.error("Signup error:", err);
      setStatus("Something went wrong. Please try again.");
    }
  };

  form.addEventListener("submit", onSubmit, true);
});