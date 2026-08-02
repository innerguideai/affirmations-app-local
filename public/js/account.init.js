// /js/account.init.js
"use strict";

// Strict session fetch using /api/me
async function getSessionUserStrict() {
  try {

    const res = await apiFetch("/api/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });


    if (!res.ok) return null;

    let txt = (await res.text()).replace(/^\uFEFF/, "").trim();

    const user = txt ? JSON.parse(txt) : null;

    if (user && user.id && !user._id) user._id = user.id;

    return (user && (user._id || user.id)) ? user : null;
  } catch (err) {
    console.warn("[account] getSessionUserStrict error", err);
    return null;
  }
}

// Initialize the Account page based on real session state
async function initAccountPage() {

  const titleEl = document.getElementById("createOrAccount");
  const linkEl  = document.getElementById("createOrAccountLink");
  const hintEl  = document.getElementById("accountHint");

  const rowAff  = document.getElementById("row-my-affirmations");
  const rowTop3 = document.getElementById("row-top3");

  if (!titleEl || !linkEl || !hintEl) {
    console.warn("[account] Missing core account elements");
    return;
  }

  const user = await getSessionUserStrict();
  const hasAccount = !!user;


  if (hasAccount) {
    titleEl.textContent = "Account information";
    hintEl.textContent  = "Signed in — your data is synced to this device";
    linkEl.href         = "/account-info.html";

    rowAff?.classList.remove("is-disabled");
    rowTop3?.classList.remove("is-disabled");
  } else {
    titleEl.textContent = "Create an account";
    hintEl.textContent  = "Having an account secures your data";
    linkEl.href         = "/signup.html";

    rowAff?.classList.add("is-disabled");
    rowTop3?.classList.add("is-disabled");
  }
}

document.addEventListener("DOMContentLoaded", initAccountPage);
