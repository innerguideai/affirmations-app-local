// public/js/reminders.js
"use strict";

function getLN() {
  if (window.IG?.LocalNotifications) return window.IG.LocalNotifications;
  if (window.Capacitor?.Plugins?.LocalNotifications) {
    return window.Capacitor.Plugins.LocalNotifications;
  }
  return null;
}

// ------------------------------
// Mode switch: onboarding vs settings
// ------------------------------
const qs = new URLSearchParams(window.location.search);
const mode = (qs.get("mode") || "onboarding").toLowerCase(); // "onboarding" or "settings"

console.log("[IG][Reminders] mode =", mode);
console.log("[IG][Reminders] LocalNotifications available =", !!getLN());

// Shared notification delivery sound for all local notifications
const NOTIFICATION_SOUND = "notification.aiff";

function goNext() {
  if (mode === "settings") return;
  window.location.href = "/pathselection.html";
}

// Helpers
function parseHHMM(hhmm) {
  const raw = (hhmm || "").trim();
  const parts = raw.split(":");
  const h = parseInt(parts[0] || "9", 10);
  const m = parseInt(parts[1] || "0", 10);

  return {
    hour: Number.isFinite(h) ? h : 9,
    minute: Number.isFinite(m) ? m : 0,
  };
}

function toMinutes(hhmm) {
  const { hour, minute } = parseHHMM(hhmm);
  return hour * 60 + minute;
}

function fromMinutes(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;

  return {
    hour: hh,
    minute: mm,
  };
}

// ------------------------------
// DAILY (id=1001)
// ------------------------------
async function cancelDaily(LN) {
  try {
    await LN.cancel({ notifications: [{ id: 1001 }] });
    console.log("[IG][Reminders] canceled daily id=1001 (if any)");
  } catch (e) {
    console.log("[IG][Reminders] cancel daily skipped/failed (ok)", e);
  }
}

async function scheduleDaily(LN, hour, minute) {
  await cancelDaily(LN);

  await LN.schedule({
    notifications: [
      {
        id: 1001,
        title: "Quick check-in",
        body: "How do you feel right now? Tap to get a fitting affirmation.",
        schedule: {
          on: { hour, minute },
          allowWhileIdle: true,
        },
        sound: NOTIFICATION_SOUND,
        extra: {
          ig_route: "/profile.html?source=notify&id=1001",
        },
      },
    ],
  });

  console.log("[IG][Reminders] scheduled daily id=1001 at", hour, ":", minute);
}

// ------------------------------
// BEDTIME (id=1003)
// ------------------------------
async function cancelBedtime(LN) {
  try {
    await LN.cancel({ notifications: [{ id: 1003 }] });
    console.log("[IG][Reminders] canceled bedtime id=1003 (if any)");
  } catch (e) {
    console.log("[IG][Reminders] cancel bedtime skipped/failed (ok)", e);
  }
}

async function scheduleBedtime(LN, hour, minute) {
  await cancelBedtime(LN);

  await LN.schedule({
    notifications: [
      {
        id: 1003,
        title: "Bedtime reset",
        body: "One calm breath. One steady thought.",
        schedule: {
          on: { hour, minute },
          allowWhileIdle: true,
        },
        sound: NOTIFICATION_SOUND,
        extra: {
          ig_route: "/profile.html?source=bedtime&id=1003",
        },
      },
    ],
  });

  console.log("[IG][Reminders] scheduled bedtime id=1003 at", hour, ":", minute);
}

// ------------------------------
// DAYTIME (ids=2001..2004)
// ------------------------------
const DAYTIME_IDS = [2001, 2002, 2003, 2004];

async function cancelDaytime(LN) {
  try {
    await LN.cancel({
      notifications: DAYTIME_IDS.map((id) => ({ id })),
    });
    console.log("[IG][Reminders] canceled daytime ids=2001..2004 (if any)");
  } catch (e) {
    console.log("[IG][Reminders] cancel daytime skipped/failed (ok)", e);
  }
}

function buildEvenlySpacedTimes(startMins, endMins, count) {
  if (count <= 1) return [startMins];

  const span = endMins - startMins;
  const step = span / (count - 1);
  const times = [];

  for (let i = 0; i < count; i++) {
    times.push(Math.round(startMins + step * i));
  }

  return times;
}

async function scheduleDaytime(LN, count, startHHMM, endHHMM) {
  await cancelDaytime(LN);

  const startMins = toMinutes(startHHMM);
  const endMins = toMinutes(endHHMM);

  if (!(endMins > startMins)) {
    console.log("[IG][Reminders] Daytime NOT scheduled: end must be after start", {
      startHHMM,
      endHHMM,
    });
    return;
  }

  const safeCount = Math.max(1, Math.min(4, parseInt(count || "1", 10) || 1));
  const minsList = buildEvenlySpacedTimes(startMins, endMins, safeCount);

  const notifications = minsList.map((mins, idx) => {
    const { hour, minute } = fromMinutes(mins);
    const id = DAYTIME_IDS[idx];

    return {
      id,
      title: "Daytime reset",
      body: "Quick nudge. Take 10 seconds.",
      schedule: {
        on: { hour, minute },
        allowWhileIdle: true,
      },
      sound: NOTIFICATION_SOUND,
      extra: {
        ig_route: `/support.html?source=daytime&id=${id}`,
      },
    };
  });

  await LN.schedule({ notifications });

  console.log("[IG][Reminders] scheduled daytime", {
    count: safeCount,
    startHHMM,
    endHHMM,
    times: minsList.map((m) => {
      const { hour, minute } = fromMinutes(m);
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }),
  });
}

// ------------------------------
// Permissions
// ------------------------------
async function requestPerm(LN) {
  const res = await LN.requestPermissions();
  console.log("[IG][Reminders] requestPermissions =", res);
  return res?.display === "granted";
}

// ------------------------------
// View toggles + footer hiding
// ------------------------------
document.addEventListener("DOMContentLoaded", function () {
  const onboardingView = document.getElementById("remindersOnboardingView");
  const settingsView = document.getElementById("remindersSettingsView");
  const footer = document.getElementById("remindersFooter");

  if (mode === "settings") {
    if (onboardingView) onboardingView.style.display = "none";
    if (settingsView) settingsView.style.display = "block";
    if (footer) footer.style.display = "none";
    console.log("[IG][Reminders] view=settings (footer hidden)");
  } else {
    if (onboardingView) onboardingView.style.display = "block";
    if (settingsView) settingsView.style.display = "none";
    if (footer) footer.style.display = "";
    console.log("[IG][Reminders] view=onboarding (footer visible)");
  }
});

// ------------------------------
// Onboarding behavior
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (mode !== "onboarding") return;

  const reminderTime = document.getElementById("reminderTime");
  const remSet = document.getElementById("remSet");
  const remNotNow = document.getElementById("remNotNow");

  const savedTime = localStorage.getItem("ig_reminders_time");
  if (reminderTime) reminderTime.value = savedTime || "09:00";

  const savedEnabled = localStorage.getItem("ig_reminders_enabled");
  if (remSet) remSet.checked = savedEnabled === "true";

  if (remNotNow) {
    remNotNow.addEventListener("click", async () => {
      console.log("[IG][Reminders][Onboarding] Not now clicked");
      localStorage.setItem("ig_reminders_enabled", "false");

      const LN = getLN();
      if (LN) await cancelDaily(LN);

      window.location.href = "/pathselection.html";
    });
  }

  if (!remSet) return;

  remSet.addEventListener("change", async () => {
    try {
      const wants = !!remSet.checked;
      const hhmm = reminderTime ? reminderTime.value : "09:00";
      localStorage.setItem("ig_reminders_time", hhmm);

      if (!wants) {
        console.log("[IG][Reminders][Onboarding] toggled OFF");
        localStorage.setItem("ig_reminders_enabled", "false");

        const LN = getLN();
        if (LN) await cancelDaily(LN);

        window.location.href = "/pathselection.html";
        return;
      }

      console.log("[IG][Reminders][Onboarding] toggled ON, scheduling…");

      const LN = getLN();
      if (!LN) {
        console.log("[IG][Reminders][Onboarding] LocalNotifications not available");
        localStorage.setItem("ig_reminders_enabled", "false");
        remSet.checked = false;
        window.location.href = "/pathselection.html";
        return;
      }

      const ok = await requestPerm(LN);
      if (!ok) {
        console.log("[IG][Reminders][Onboarding] permission not granted");
        localStorage.setItem("ig_reminders_enabled", "false");
        remSet.checked = false;
        window.location.href = "/pathselection.html";
        return;
      }

      const { hour, minute } = parseHHMM(hhmm);
      await scheduleDaily(LN, hour, minute);

      localStorage.setItem("ig_reminders_enabled", "true");
      window.location.href = "/pathselection.html";
    } catch (e) {
      console.log("[IG][Reminders][Onboarding] ERROR", e);
      localStorage.setItem("ig_reminders_enabled", "false");
      remSet.checked = false;
      window.location.href = "/pathselection.html";
    }
  });
});

// ------------------------------
// Settings behavior (daily + bedtime + daytime)
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (mode !== "settings") return;

  const focusBtn = document.getElementById("igFocusHelpBtn");
  const focusModal = document.getElementById("igFocusModal");
  const focusClose = document.getElementById("igFocusCloseBtn");
  const focusOk = document.getElementById("igFocusOkBtn");

  function openFocusModal() {
    if (focusModal) focusModal.style.display = "flex";
  }

  function closeFocusModal() {
    if (focusModal) focusModal.style.display = "none";
  }

  if (focusBtn) focusBtn.addEventListener("click", openFocusModal);
  if (focusClose) focusClose.addEventListener("click", closeFocusModal);
  if (focusOk) focusOk.addEventListener("click", closeFocusModal);

  if (focusModal) {
    focusModal.addEventListener("click", (e) => {
      if (e.target === focusModal) closeFocusModal();
    });
  }

  async function dumpPending(tag) {
    const LN = getLN();
    if (!LN) {
      console.log(`[IG][Reminders][Pending][${tag}] LN missing`);
      return;
    }

    try {
      const res = await LN.getPending();
      const list = res?.notifications || [];
      console.log(
        `[IG][Reminders][Pending][${tag}] count=`,
        list.length,
        list.map((n) => ({ id: n.id, title: n.title, schedule: n.schedule, sound: n.sound }))
      );
    } catch (e) {
      console.log(`[IG][Reminders][Pending][${tag}] getPending failed`, e);
    }
  }

  const dailyEnabled = document.getElementById("dailyEnabled");
  const dailyTime = document.getElementById("dailyTime");

  const bedtimeEnabled = document.getElementById("bedtimeEnabled");
  const bedtimeTime = document.getElementById("bedtimeTime");

  const daytimeEnabled = document.getElementById("daytimeEnabled");
  const daytimeCount = document.getElementById("daytimeCount");
  const daytimeStart = document.getElementById("daytimeStart");
  const daytimeEnd = document.getElementById("daytimeEnd");

  const savedDailyTime = localStorage.getItem("ig_reminders_time") || "09:00";
  const savedDailyEnabled = localStorage.getItem("ig_reminders_enabled") === "true";
  if (dailyTime) dailyTime.value = savedDailyTime;
  if (dailyEnabled) dailyEnabled.checked = savedDailyEnabled;

  const daytimeSavedEnabled = localStorage.getItem("ig_daytime_enabled") === "true";
  const daytimeSavedCount = localStorage.getItem("ig_daytime_count") || "1";
  const daytimeSavedStart = localStorage.getItem("ig_daytime_start") || "09:00";
  const daytimeSavedEnd = localStorage.getItem("ig_daytime_end") || "17:00";

  if (daytimeEnabled) daytimeEnabled.checked = daytimeSavedEnabled;
  if (daytimeCount) daytimeCount.value = daytimeSavedCount;
  if (daytimeStart) daytimeStart.value = daytimeSavedStart;
  if (daytimeEnd) daytimeEnd.value = daytimeSavedEnd;

  const bedtimeSavedEnabled = localStorage.getItem("ig_bedtime_enabled") === "true";
  const bedtimeSavedTime = localStorage.getItem("ig_bedtime_time") || "21:30";

  if (bedtimeEnabled) bedtimeEnabled.checked = bedtimeSavedEnabled;
  if (bedtimeTime) bedtimeTime.value = bedtimeSavedTime;

  console.log("[IG][Reminders][Settings] loaded (storage)", {
    daily: { savedDailyTime, savedDailyEnabled },
    daytime: {
      daytimeSavedEnabled,
      daytimeSavedCount,
      daytimeSavedStart,
      daytimeSavedEnd,
    },
    bedtime: { bedtimeSavedEnabled, bedtimeSavedTime },
  });

  function saveDaytimeToStorage() {
    localStorage.setItem("ig_daytime_enabled", String(!!daytimeEnabled?.checked));
    localStorage.setItem("ig_daytime_count", String(daytimeCount?.value || "1"));
    localStorage.setItem("ig_daytime_start", String(daytimeStart?.value || "09:00"));
    localStorage.setItem("ig_daytime_end", String(daytimeEnd?.value || "17:00"));
  }

  function saveBedtimeToStorage() {
    localStorage.setItem("ig_bedtime_enabled", String(!!bedtimeEnabled?.checked));
    localStorage.setItem("ig_bedtime_time", String(bedtimeTime?.value || "21:30"));
  }

  async function syncTogglesFromPending() {
    const LN = getLN();
    if (!LN) return;

    try {
      const pendingRes = await LN.getPending();
      const list = pendingRes?.notifications || [];
      const ids = new Set(list.map((n) => n.id));

      if (dailyEnabled) dailyEnabled.checked = ids.has(1001);
      if (bedtimeEnabled) bedtimeEnabled.checked = ids.has(1003);
      if (daytimeEnabled) {
        daytimeEnabled.checked =
          ids.has(2001) || ids.has(2002) || ids.has(2003) || ids.has(2004);
      }

      saveBedtimeToStorage();
      saveDaytimeToStorage();

      console.log("[IG][Reminders][Settings] synced toggles from pending", {
        daily: !!dailyEnabled?.checked,
        daytime: !!daytimeEnabled?.checked,
        bedtime: !!bedtimeEnabled?.checked,
      });
    } catch (e) {
      console.log("[IG][Reminders][Settings] getPending failed", e);
    }
  }

  syncTogglesFromPending();

  async function applyDailyFromSettings() {
    const wants = !!(dailyEnabled && dailyEnabled.checked);
    const hhmm = dailyTime ? dailyTime.value : "09:00";
    localStorage.setItem("ig_reminders_time", hhmm);

    const LN = getLN();
    if (!LN) {
      console.log("[IG][Reminders][Settings] Daily: LocalNotifications not available");
      localStorage.setItem("ig_reminders_enabled", "false");
      if (dailyEnabled) dailyEnabled.checked = false;
      return;
    }

    if (!wants) {
      console.log("[IG][Reminders][Settings] Daily OFF");
      localStorage.setItem("ig_reminders_enabled", "false");
      await cancelDaily(LN);
      return;
    }

    const ok = await requestPerm(LN);
    if (!ok) {
      console.log("[IG][Reminders][Settings] Daily permission not granted");
      localStorage.setItem("ig_reminders_enabled", "false");
      if (dailyEnabled) dailyEnabled.checked = false;
      return;
    }

    const { hour, minute } = parseHHMM(hhmm);
    await scheduleDaily(LN, hour, minute);
    localStorage.setItem("ig_reminders_enabled", "true");
    console.log("[IG][Reminders][Settings] Daily saved at", hhmm);
  }

  async function applyBedtimeFromSettings() {
    saveBedtimeToStorage();

    const wants = !!(bedtimeEnabled && bedtimeEnabled.checked);
    const hhmm = bedtimeTime ? bedtimeTime.value : "21:30";
    const { hour, minute } = parseHHMM(hhmm);

    const LN = getLN();
    if (!LN) {
      console.log("[IG][Reminders][Settings] Bedtime: LocalNotifications not available");
      if (bedtimeEnabled) bedtimeEnabled.checked = false;
      saveBedtimeToStorage();
      return;
    }

    if (!wants) {
      console.log("[IG][Reminders][Settings] Bedtime OFF");
      await cancelBedtime(LN);
      return;
    }

    const ok = await requestPerm(LN);
    if (!ok) {
      console.log("[IG][Reminders][Settings] Bedtime permission not granted");
      if (bedtimeEnabled) bedtimeEnabled.checked = false;
      saveBedtimeToStorage();
      return;
    }

    await scheduleBedtime(LN, hour, minute);
    console.log("[IG][Reminders][Settings] Bedtime saved at", hhmm);
  }

  async function applyDaytimeFromSettings() {
    saveDaytimeToStorage();

    const wants = !!(daytimeEnabled && daytimeEnabled.checked);
    const count = daytimeCount ? daytimeCount.value : "1";
    const startHHMM = daytimeStart ? daytimeStart.value : "09:00";
    const endHHMM = daytimeEnd ? daytimeEnd.value : "17:00";

    const LN = getLN();
    if (!LN) {
      console.log("[IG][Reminders][Settings] Daytime: LocalNotifications not available");
      if (daytimeEnabled) daytimeEnabled.checked = false;
      saveDaytimeToStorage();
      return;
    }

    if (!wants) {
      console.log("[IG][Reminders][Settings] Daytime OFF");
      await cancelDaytime(LN);
      return;
    }

    const ok = await requestPerm(LN);
    if (!ok) {
      console.log("[IG][Reminders][Settings] Daytime permission not granted");
      if (daytimeEnabled) daytimeEnabled.checked = false;
      saveDaytimeToStorage();
      return;
    }

    await scheduleDaytime(LN, count, startHHMM, endHHMM);
    console.log("[IG][Reminders][Settings] Daytime saved", { count, startHHMM, endHHMM });
  }

  if (dailyEnabled) dailyEnabled.addEventListener("change", applyDailyFromSettings);

  if (dailyTime) {
    dailyTime.addEventListener("change", () => {
      if (dailyEnabled && dailyEnabled.checked) {
        applyDailyFromSettings();
      } else {
        localStorage.setItem("ig_reminders_time", dailyTime.value || "09:00");
      }
    });
  }

  if (bedtimeEnabled) {
    bedtimeEnabled.addEventListener("change", () => {
      saveBedtimeToStorage();
      applyBedtimeFromSettings();
    });
  }

  if (bedtimeTime) {
    bedtimeTime.addEventListener("change", () => {
      saveBedtimeToStorage();
      if (bedtimeEnabled && bedtimeEnabled.checked) applyBedtimeFromSettings();
    });
  }

  if (daytimeEnabled) {
    daytimeEnabled.addEventListener("change", () => {
      saveDaytimeToStorage();
      applyDaytimeFromSettings();
    });
  }

  if (daytimeCount) {
    daytimeCount.addEventListener("change", () => {
      saveDaytimeToStorage();
      if (daytimeEnabled && daytimeEnabled.checked) applyDaytimeFromSettings();
    });
  }

  if (daytimeStart) {
    daytimeStart.addEventListener("change", () => {
      saveDaytimeToStorage();
      if (daytimeEnabled && daytimeEnabled.checked) applyDaytimeFromSettings();
    });
  }

  if (daytimeEnd) {
    daytimeEnd.addEventListener("change", () => {
      saveDaytimeToStorage();
      if (daytimeEnabled && daytimeEnabled.checked) applyDaytimeFromSettings();
    });
  }

  dumpPending("settings-load");
});

// ------------------------------
// UAT test button (onboarding only)
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (mode !== "onboarding") return;

  const testBtn = document.getElementById("testNotifyBtn");
  const statusEl = document.getElementById("notifyStatus");

  const setNotifyStatus = (msg) => {
    console.log("[REM][NOTIFY]", msg);
    if (statusEl) statusEl.textContent = msg;
  };

  if (!testBtn) return;

  testBtn.addEventListener("click", async () => {
    try {
      const LN = getLN();
      if (!LN) {
        setNotifyStatus("LocalNotifications not available.");
        return;
      }

      setNotifyStatus("Checking notification permission...");
      const perm = await LN.checkPermissions();
      setNotifyStatus(`Permission status: ${perm.display}`);

      if (perm.display !== "granted") {
        setNotifyStatus("Requesting permission...");
        const req = await LN.requestPermissions();
        setNotifyStatus(`Permission after request: ${req.display}`);
        if (req.display !== "granted") {
          setNotifyStatus("Permission not granted. Enable notifications in iOS Settings.");
          return;
        }
      }

      const fireAt = new Date(Date.now() + 15 * 1000);
      const id = Math.floor(Date.now() / 1000);

      setNotifyStatus(`Scheduling test notification for ${fireAt.toLocaleTimeString()}...`);

      await LN.schedule({
        notifications: [
          {
            id,
            title: "AI Affirm: Quick check-in",
            body: "How do you feel right now? Tap to get a fitting affirmation.",
            schedule: { at: fireAt },
            sound: NOTIFICATION_SOUND,
            smallIcon: "ic_stat_icon",
            extra: {
              ig_route: `/support.html?source=uat&id=${id}`,
            },
          },
        ],
      });

      setNotifyStatus("Scheduled. Lock your phone and wait ~15 seconds.");
    } catch (err) {
      console.error("[REM][NOTIFY] Error:", err);
      setNotifyStatus(`Error: ${err?.message || String(err)}`);
    }
  });
});