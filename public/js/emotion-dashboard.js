// public/js/emotion-dashboard.js
"use strict";

console.log("[emotion-dashboard] loaded");

(function () {
  // ------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------
  const els = {
    loadingCard: document.getElementById("emotionDashboardLoadingCard"),
    errorCard: document.getElementById("emotionDashboardErrorCard"),
    errorText: document.getElementById("emotionDashboardErrorText"),
    retryBtn: document.getElementById("emotionDashboardRetryBtn"),
    content: document.getElementById("emotionDashboardContent"),

    kpiMostFeltValue: document.getElementById("kpiMostFeltValue"),
    kpiMostFeltMeta: document.getElementById("kpiMostFeltMeta"),
    kpiRangeValue: document.getElementById("kpiRangeValue"),
    kpiPeakValue: document.getElementById("kpiPeakValue"),
    kpiPeakMeta: document.getElementById("kpiPeakMeta"),

    monthlyInsightCard: document.getElementById("monthlyInsightCard"),
    monthlyInsightCollapsed: document.getElementById("monthlyInsightCollapsed"),
    monthlyInsightExpanded: document.getElementById("monthlyInsightExpanded"),
    monthlyInsightPattern: document.getElementById("monthlyInsightPattern"),
    monthlyInsightAction: document.getElementById("monthlyInsightAction"),
    monthlyInsightTips: document.getElementById("monthlyInsightTips"),
    monthlyInsightAffirmationLabel: document.getElementById("monthlyInsightAffirmationLabel"),
    monthlyInsightReset: document.getElementById("monthlyInsightReset"),
    monthlyInsightPracticeBtn: document.getElementById("monthlyInsightPracticeBtn"),
    monthlyInsightGotItBtn: document.getElementById("monthlyInsightGotItBtn"),

    top10Summary: document.getElementById("top10Summary"),
    top10Chart: document.getElementById("top10Chart"),

    trendSummary: document.getElementById("trendSummary"),
    trendSvg: document.getElementById("emotionTrendSvg"),

    heatmapSummary: document.getElementById("heatmapSummary"),
    heatmap: document.getElementById("emotionHeatmap")
  };

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  function setLoadingState() {
    els.loadingCard.classList.remove("hidden");
    els.errorCard.classList.add("hidden");
    els.content.classList.add("hidden");
  }

  function setErrorState(message) {
    els.loadingCard.classList.add("hidden");
    els.content.classList.add("hidden");
    els.errorCard.classList.remove("hidden");
    els.errorText.textContent = message || "Please try again.";
  }

  function setReadyState() {
    els.loadingCard.classList.add("hidden");
    els.errorCard.classList.add("hidden");
    els.content.classList.remove("hidden");
  }

  function titleCase(value) {
    const raw = String(value || "").trim();
    if (!raw) return "—";

    return raw
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  function pluralize(word, count) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function buildTop10Summary(rows) {
    if (!rows.length) return "No emotion logs yet this month.";

    const names = rows.slice(0, 3).map((row) => titleCase(row.emotion));
    if (names.length === 1) return `${names[0]} led this month.`;
    if (names.length === 2) return `${names[0]} and ${names[1]} led this month.`;

    return `${names[0]}, ${names[1]}, and ${names[2]} led this month.`;
  }

  function buildTrendSummary(trendEmotion, peakLabel) {
    const safeEmotion = titleCase(trendEmotion);
    const safePeak = peakLabel || "this month";

    if (safeEmotion === "—") return "No weekly trend yet.";
    return `${safeEmotion} peaked ${safePeak}, then continued to shift across the month.`;
  }

  function buildHeatmapSummary(heatmapRows) {
    if (!heatmapRows.length) return "No weekly pattern yet.";

    let bestEmotion = null;
    let bestDay = null;
    let bestCount = -1;

    for (const row of heatmapRows) {
      const days = safeArray(row.days);
      for (const item of days) {
        const count = Number(item.count || 0);
        if (count > bestCount) {
          bestCount = count;
          bestEmotion = row.emotion;
          bestDay = item.day;
        }
      }
    }

    if (!bestEmotion || !bestDay || bestCount <= 0) {
      return "No clear weekly pattern yet.";
    }

    return `${titleCase(bestEmotion)} showed up most on ${bestDay}.`;
  }

  function getEmotionAction(emotion) {
    const key = String(emotion || "").toLowerCase().trim();
    const actions = {
      tired: "Check sleep, recovery, and weekend load.",
      stressed: "Plan one reset before the pressure point.",
      anxious: "Add a short grounding pause before that time.",
      sad: "Add one supportive connection or gentle activity.",
      angry: "Add a pause before responding.",
      overwhelmed: "Reduce one task before that time."
    };

    return actions[key] || "Notice what usually happens before this emotion.";
  }

  function findTopHeatmapPattern(heatmapRows, targetEmotion) {
    const target = String(targetEmotion || "").toLowerCase().trim();
    let best = null;

    for (const row of safeArray(heatmapRows)) {
      const rowEmotion = String(row && row.emotion || "").toLowerCase().trim();
      if (target && rowEmotion !== target) continue;

      for (const day of safeArray(row && row.days)) {
        const count = Number(day && day.count || 0);
        if (!day || count <= 0) continue;

        if (!best || count > best.count) {
          best = {
            emotion: rowEmotion,
            day: day.day || "",
            time: day.time || day.timeOfDay || day.period || "",
            count
          };
        }
      }
    }

    return best;
  }

  function fullDayName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const dayMap = {
      sun: "Sunday",
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday"
    };
    const normalized = raw.toLowerCase().replace(/[^a-z]/g, "");
    const match = normalized.match(/sun|mon|tue|wed|thu|fri|sat/);

    return match ? dayMap[match[0]] : titleCase(raw);
  }

  function buildPatternLabel(pattern) {
    if (!pattern || !pattern.day) return "";
    const day = fullDayName(pattern.day);
    const time = String(pattern.time || "").trim().toLowerCase();
    return time ? `${day} ${time}` : day;
  }

  function labelText(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();
  }

  function sentenceStart(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function monthKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `ig_monthly_insight_collapsed_${year}_${month}`;
  }

  function isMonthlyInsightCollapsed() {
    try {
      return localStorage.getItem(monthKey()) === "1";
    } catch (_) {
      return false;
    }
  }

  function setMonthlyInsightCollapsed(isCollapsed) {
    if (!els.monthlyInsightCollapsed || !els.monthlyInsightExpanded) return;

    els.monthlyInsightCollapsed.classList.toggle("hidden", !isCollapsed);
    els.monthlyInsightExpanded.classList.toggle("hidden", isCollapsed);
    if (els.monthlyInsightCard) {
      els.monthlyInsightCard.classList.toggle("is-collapsed", isCollapsed);
    }
  }

  function saveMonthlyInsightCollapsed() {
    try {
      localStorage.setItem(monthKey(), "1");
    } catch (_) {}
    setMonthlyInsightCollapsed(true);
  }

  function getAffirmationText(affirmation) {
    if (affirmation && typeof affirmation === "object") {
      return String(affirmation.text || "").trim();
    }
    return String(affirmation || "").trim();
  }

  function getAffirmationId(affirmation) {
    if (!affirmation || typeof affirmation !== "object") return "";
    return String(affirmation.id || affirmation._id || affirmation.affirmationId || "").trim();
  }

  function getInsightTips(emotion, driver, pressure) {
    const haystack = [emotion, driver, pressure].map(labelText).join(" ");
    const has = (value) => haystack.includes(value);

    if (has("work friction") || has("work")) {
      return [
        "Step away from the desk for 2 minutes.",
        "Try box breathing: inhale 4, hold 4, exhale 4, hold 4."
      ];
    }

    if (has("health uncertainty") || has("health")) {
      return [
        "Write down what you know, what you do not know, and the next small step.",
        "Take one calming breath before searching for more answers."
      ];
    }

    if (has("unsupported") || has("loneliness")) {
      return [
        "Send one simple message to someone safe.",
        "Plan one small connection before the day feels too open."
      ];
    }

    if (has("low energy") || has("tired")) {
      return [
        "Protect one rest block before adding more tasks.",
        "Check sleep, food, and recovery before pushing harder."
      ];
    }

    if (has("too much") || has("overwhelmed")) {
      return [
        "Remove or delay one task.",
        "Choose the next smallest step only."
      ];
    }

    return [
      "Notice what usually happens before this feeling appears.",
      "Take a 2-minute reset before the pattern usually starts."
    ];
  }

  function renderTips(tips) {
    if (!els.monthlyInsightTips) return;
    els.monthlyInsightTips.innerHTML = safeArray(tips)
      .map((tip) => `<li>${escapeHtml(tip)}</li>`)
      .join("");
  }

  async function fetchMonthlyInsightFallbackAffirmation(emotion, userId) {
    const safeEmotion = String(emotion || "").trim();
    const safeUserId = String(userId || "").trim();
    if (!safeEmotion || !safeUserId || typeof window.apiFetch !== "function") return null;

    console.log("[BUG-0025] monthly insight fallback starting", {
      emotion: safeEmotion,
      userId: safeUserId
    });

    try {
      const res = await window.apiFetch("/api/affirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emotion: safeEmotion,
          userId: safeUserId
        })
      });

      if (!res.ok) {
        console.log("[BUG-0025] monthly insight fallback none", {
          emotion: safeEmotion,
          status: res.status
        });
        return null;
      }

      const data = await res.json();
      const affirmation = data && data.affirmation ? data.affirmation : null;
      if (getAffirmationText(affirmation)) {
        console.log("[BUG-0025] monthly insight fallback found", {
          emotion: safeEmotion,
          affirmationId: getAffirmationId(affirmation) || null
        });
        return affirmation;
      }

      console.log("[BUG-0025] monthly insight fallback none", {
        emotion: safeEmotion,
        status: res.status
      });
      return null;
    } catch (err) {
      console.log("[BUG-0025] monthly insight fallback none", {
        emotion: safeEmotion,
        error: String(err && err.message ? err.message : err)
      });
      return null;
    }
  }

  function setPracticeRoute(emotion, affirmationId) {
    if (!els.monthlyInsightPracticeBtn) return;

    const params = new URLSearchParams();
    params.set("source", "monthly_insight");

    if (affirmationId) {
      params.set("affirmationId", affirmationId);
    } else if (emotion) {
      params.set("emotion", emotion);
    }

    els.monthlyInsightPracticeBtn.dataset.href = `/support.html?${params.toString()}`;
  }

  function normalizeDashboardData(raw) {
    const summary = raw && raw.summary ? raw.summary : {};
    const charts = raw && raw.charts ? raw.charts : {};
    const monthlyInsight = raw && raw.monthlyInsight ? raw.monthlyInsight : null;

    const top10 = safeArray(charts.top10).slice(0, 6);
    const trend = charts.trend || {};
    const heatmap = safeArray(charts.heatmap);

    return {
      summary: {
        monthlyInsight,
        mostFelt: summary.mostFelt || { emotion: null, count: 0 },
        range: summary.range || { distinctCount: 0 },
        topEmotionPeak: summary.topEmotionPeak || {
          emotion: null,
          peakLabel: null
        }
      },
      charts: {
        top10,
        trend: {
          emotion: trend.emotion || null,
          series: safeArray(trend.series)
        },
        heatmap
      }
    };
  }

  // ------------------------------------------------------------
  // Render KPI cards
  // ------------------------------------------------------------
  function renderKpis(data) {
    const mostFelt = data.summary.mostFelt || {};
    const range = data.summary.range || {};
    const peak = data.summary.topEmotionPeak || {};

    els.kpiMostFeltValue.textContent = titleCase(mostFelt.emotion);
    els.kpiMostFeltMeta.textContent = `${pluralize("check-in", Number(mostFelt.count || 0))}`;

    const distinctCount = Number(range.distinctCount || 0);
    els.kpiRangeValue.innerHTML = `
      <span class="emotion-dashboard-kpi-number">${distinctCount}</span>
      <span class="emotion-dashboard-kpi-word">emotion${distinctCount === 1 ? "" : "s"}</span>
    `;

    els.kpiPeakValue.textContent = peak.peakLabel || "—";
    els.kpiPeakMeta.textContent = peak.emotion ? `for ${titleCase(peak.emotion)}` : "for —";
  }

  async function renderMonthlyInsight(data, userId) {
const monthlyInsight = data.monthlyInsight || data.summary?.monthlyInsight || {};
console.log("[BUG-0025] resolved monthlyInsight:", monthlyInsight);    const insightEmotion = labelText(monthlyInsight.emotion);
    const driverLabel = labelText(monthlyInsight.driver);
    const pressureLabel = labelText(monthlyInsight.pressure);
    let insightAffirmation = monthlyInsight.affirmation;
    let affirmationText = getAffirmationText(insightAffirmation);
    let affirmationId = getAffirmationId(insightAffirmation);

    if (insightEmotion) {
      if (!affirmationText) {
        const fallbackAffirmation = await fetchMonthlyInsightFallbackAffirmation(insightEmotion, userId);
        if (fallbackAffirmation) {
          insightAffirmation = fallbackAffirmation;
          affirmationText = getAffirmationText(insightAffirmation);
          affirmationId = getAffirmationId(insightAffirmation);
        }
      }

      const explicitDay = monthlyInsight.day || monthlyInsight.weekday || monthlyInsight.dayOfWeek;
      const heatmapPattern = findTopHeatmapPattern(data.charts.heatmap, insightEmotion);
      const dayLabel = explicitDay
        ? fullDayName(explicitDay)
        : fullDayName(heatmapPattern && heatmapPattern.day);
      const patternSuffix = dayLabel ? ` on ${dayLabel}` : "";
      const emotionLabel = sentenceStart(insightEmotion);

      els.monthlyInsightCollapsed.textContent = `Monthly insight · ${emotionLabel} this month`;
      els.monthlyInsightPattern.textContent =
        `${emotionLabel} showed up most often this month${patternSuffix}.`;

      if (driverLabel || pressureLabel) {
        const contextParts = [];
        if (driverLabel) contextParts.push(driverLabel);
        if (pressureLabel) contextParts.push(pressureLabel);
        els.monthlyInsightAction.textContent =
          `It was mostly connected to ${contextParts.join(" and ")}.`;
      } else {
        els.monthlyInsightAction.textContent =
          "This pattern may be connected to what usually happens before that time.";
      }

      renderTips([
        ...getInsightTips(insightEmotion, driverLabel, pressureLabel),
        "Practice a 2-minute reset before this pattern usually starts."
      ]);

      if (affirmationText) {
        els.monthlyInsightAffirmationLabel.hidden = false;
        els.monthlyInsightAffirmationLabel.textContent = "Use this affirmation:";
        els.monthlyInsightReset.textContent = `"${affirmationText}"`;
      } else {
        els.monthlyInsightAffirmationLabel.hidden = true;
        els.monthlyInsightAffirmationLabel.textContent = "";
        els.monthlyInsightReset.textContent = "No saved reset found for this pattern yet.";
      }

      setPracticeRoute(insightEmotion, affirmationId);
      setMonthlyInsightCollapsed(isMonthlyInsightCollapsed());
      return;
    }

    const mostFelt = data.summary.mostFelt || {};
    const emotion = String(mostFelt.emotion || "").toLowerCase().trim();
    const count = Number(mostFelt.count || 0);

    if (!emotion || count <= 0) {
      els.monthlyInsightPattern.textContent = "No emotion logs yet this month.";
      els.monthlyInsightAction.textContent = "Look for what usually happens before an emotion shows up.";
      els.monthlyInsightAffirmationLabel.hidden = true;
      els.monthlyInsightReset.textContent = "Try a quick check-in when you notice a shift.";
      renderTips([]);
      setPracticeRoute("", "");
      setMonthlyInsightCollapsed(false);
      return;
    }

    const pattern = findTopHeatmapPattern(data.charts.heatmap, emotion);
    const patternLabel = buildPatternLabel(pattern);
    const emotionLabel = titleCase(emotion);

    if (patternLabel) {
      els.monthlyInsightPattern.textContent =
        `This month, ${emotionLabel} showed up most often on ${patternLabel}.`;
    } else {
      els.monthlyInsightPattern.textContent =
        `This month, your most logged emotion was ${emotionLabel}.`;
    }

    els.monthlyInsightAction.textContent = getEmotionAction(emotion);
    els.monthlyInsightAffirmationLabel.hidden = true;
    els.monthlyInsightReset.textContent = patternLabel
      ? "Try a 2-minute reset before that pattern usually starts."
      : "Look for what usually happens before this emotion shows up.";
    els.monthlyInsightCollapsed.textContent = `Monthly insight · ${emotionLabel} this month`;
    renderTips([]);
    setPracticeRoute(emotion, "");
    setMonthlyInsightCollapsed(isMonthlyInsightCollapsed());
  }

  // ------------------------------------------------------------
  // Render top 10 chart
  // ------------------------------------------------------------
  function renderTop10Chart(rows) {
    els.top10Chart.innerHTML = "";

    if (!rows.length) {
      els.top10Chart.innerHTML = `
        <div class="emotion-dashboard-heatmap-empty">No emotion logs yet this month.</div>
      `;
      els.top10Summary.textContent = "No emotion logs yet this month.";
      return;
    }

    const maxCount = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
    els.top10Summary.textContent = buildTop10Summary(rows);

    const html = rows.map((row, index) => {
      const count = Number(row.count || 0);
      const heightPx = clamp(Math.round((count / maxCount) * 148) + 72, 72, 220);
      const emotion = titleCase(row.emotion);
      const isTop = !!row.isTop || index === 0;

      return `
        <div class="emotion-dashboard-bar-col ${isTop ? "is-top" : ""}">
          <div class="emotion-dashboard-bar-badge">${count}</div>
          <div class="emotion-dashboard-bar" style="height:${heightPx}px;">
            <div class="emotion-dashboard-bar-label">${escapeHtml(emotion)}</div>
          </div>
        </div>
      `;
    }).join("");

    els.top10Chart.innerHTML = html;
  }

  // ------------------------------------------------------------
  // Render line chart
  // ------------------------------------------------------------
  function renderTrendChart(trend) {
    const safeSeries = safeArray(trend.series);
    const emotion = trend.emotion || null;

    els.trendSummary.textContent = buildTrendSummary(
      emotion,
      (window.__emotionDashboardData &&
        window.__emotionDashboardData.summary &&
        window.__emotionDashboardData.summary.topEmotionPeak &&
        window.__emotionDashboardData.summary.topEmotionPeak.peakLabel) || null
    );

    if (!safeSeries.length) {
      els.trendSvg.innerHTML = "";
      return;
    }

    const width = 340;
    const height = 170;
    const left = 26;
    const right = 16;
    const top = 20;
    const bottom = 42;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    const values = safeSeries.map((item) => Number(item.count || 0));
    const maxValue = Math.max(...values, 1);

    const points = safeSeries.map((item, index) => {
      const x = left + (chartWidth / Math.max(safeSeries.length - 1, 1)) * index;
      const y = top + chartHeight - ((Number(item.count || 0) / maxValue) * chartHeight);
      return {
        label: item.week || `Week ${index + 1}`,
        count: Number(item.count || 0),
        x,
        y
      };
    });

    const path = points
      .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const accentStrong = getCssVar("--theme-accent-strong") || "#476B38";
    const accentSoft = getCssVar("--theme-accent") || "#B7D4AB";
    const lineGrid = "rgba(25,38,50,0.10)";
    const labelColor = "rgba(25,38,50,0.68)";
    const fillGlow = "rgba(255,255,255,0.75)";

    const peakIndex = values.indexOf(maxValue);

    const gridY1 = top + chartHeight;
    const gridY2 = top + chartHeight * 0.66;
    const gridY3 = top + chartHeight * 0.33;

    els.trendSvg.innerHTML = `
      <line x1="${left}" y1="${gridY1}" x2="${width - right}" y2="${gridY1}" stroke="${lineGrid}" stroke-width="1" />
      <line x1="${left}" y1="${gridY2}" x2="${width - right}" y2="${gridY2}" stroke="${lineGrid}" stroke-width="1" />
      <line x1="${left}" y1="${gridY3}" x2="${width - right}" y2="${gridY3}" stroke="${lineGrid}" stroke-width="1" />

      <path
        d="${path}"
        fill="none"
        stroke="${accentStrong}"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>

      ${points.map((p, index) => {
        const isPeak = index === peakIndex;
        return `
          <circle
            cx="${p.x}"
            cy="${p.y}"
            r="${isPeak ? 6 : 5}"
            fill="${isPeak ? accentStrong : fillGlow}"
            stroke="${accentStrong}"
            stroke-width="${isPeak ? 3 : 2.5}"
          ></circle>
          <text
            x="${p.x}"
            y="${p.y - 12}"
            text-anchor="middle"
            font-size="11"
            font-weight="800"
            fill="${accentStrong}"
          >${p.count}</text>
        `;
      }).join("")}

      ${points.map((p) => `
        <text
          x="${p.x}"
          y="${height - 14}"
          text-anchor="middle"
          font-size="11"
          font-weight="700"
          fill="${labelColor}"
        >${p.label}</text>
      `).join("")}
    `;
  }

  // ------------------------------------------------------------
  // Render heatmap
  // ------------------------------------------------------------
  function renderHeatmap(rows) {
    els.heatmap.innerHTML = "";

    if (!rows.length) {
      els.heatmap.innerHTML = `
        <div class="emotion-dashboard-heatmap-empty">No weekly pattern yet.</div>
      `;
      els.heatmapSummary.textContent = "No weekly pattern yet.";
      return;
    }

    els.heatmapSummary.textContent = buildHeatmapSummary(rows);

    let maxCellCount = 0;
    rows.forEach((row) => {
      safeArray(row.days).forEach((d) => {
        maxCellCount = Math.max(maxCellCount, Number(d.count || 0));
      });
    });

    if (maxCellCount < 1) maxCellCount = 1;

    const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const headHtml = `
      <div class="emotion-dashboard-heatmap-head">
        <div></div>
        ${dayOrder.map((day) => `
          <div class="emotion-dashboard-heatmap-day-head">${day}</div>
        `).join("")}
      </div>
    `;

    const rowsHtml = rows.map((row, index) => {
      const dayMap = {};
      safeArray(row.days).forEach((dayRow) => {
        dayMap[dayRow.day] = Number(dayRow.count || 0);
      });

      const cells = dayOrder.map((day) => {
        const count = dayMap[day] || 0;
        const opacity = count <= 0 ? 0.20 : clamp(count / maxCellCount, 0.22, 1);
        const background = `color-mix(in srgb, var(--theme-accent-strong) ${Math.round(opacity * 100)}%, white)`;

        return `
          <div
            class="emotion-dashboard-heatmap-cell"
            style="background:${background};"
            title="${titleCase(row.emotion)} • ${day}: ${count}"
            aria-label="${titleCase(row.emotion)} on ${day}: ${count}"
          ></div>
        `;
      }).join("");

      return `
        <div class="emotion-dashboard-heatmap-row ${index === 0 ? "is-top" : ""}">
          <div class="emotion-dashboard-heatmap-emotion">${escapeHtml(titleCase(row.emotion))}</div>
          ${cells}
        </div>
      `;
    }).join("");

    els.heatmap.innerHTML = `
      <div class="emotion-dashboard-heatmap-grid">
        ${headHtml}
        ${rowsHtml}
      </div>
    `;
  }

  // ------------------------------------------------------------
  // Load dashboard
  // ------------------------------------------------------------
async function loadDashboard() {
  try {
    setLoadingState();

    // 1) Use the same app-wide user source used elsewhere
    let currentUser = null;

    if (typeof window.getCurrentUser === "function") {
      currentUser = await window.getCurrentUser();
    }

    // 2) Fallback to localStorage if needed
    if (!currentUser) {
      try {
        const raw = localStorage.getItem("currentUser") || "{}";
        currentUser = JSON.parse(raw);
      } catch (_) {
        currentUser = null;
      }
    }

    const userId =
      (currentUser && (currentUser._id || currentUser.id)) ||
      localStorage.getItem("currentUserId") ||
      "";

    if (!userId) {
      setErrorState("We couldn’t find your account id.");
      return;
    }

    console.log("[emotion-dashboard] using userId:", userId);

    // 3) Call dashboard with explicit userId query param
    const res = await window.apiFetch(
      `/api/emotions/dashboard?userId=${encodeURIComponent(String(userId))}`,
      { method: "GET" }
    );

    const rawText = await res.text();
    let parsed = null;

    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch (parseErr) {
      console.error("[emotion-dashboard] invalid JSON:", parseErr, rawText);
      setErrorState("The server returned data we could not read.");
      return;
    }

    if (!res.ok) {
      console.error("[emotion-dashboard] request failed:", res.status, parsed);
      setErrorState(
        (parsed && parsed.message) || `We couldn’t load your emotion insights. (${res.status})`
      );
      return;
    }

    const data = normalizeDashboardData(parsed);
    window.__emotionDashboardData = data;

    console.log("[emotion-dashboard] data", data);

    await renderMonthlyInsight(data, userId);
    renderKpis(data);
    renderTop10Chart(data.charts.top10);
    renderTrendChart(data.charts.trend);
    renderHeatmap(data.charts.heatmap);

    setReadyState();
  } catch (err) {
    console.error("[emotion-dashboard] load failed:", err);
    setErrorState("Something went wrong while loading your insights.");
  }
}
  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    if (els.retryBtn) {
      els.retryBtn.addEventListener("click", loadDashboard);
    }

    if (els.monthlyInsightCollapsed) {
      els.monthlyInsightCollapsed.addEventListener("click", function () {
        setMonthlyInsightCollapsed(false);
      });
    }

    if (els.monthlyInsightGotItBtn) {
      els.monthlyInsightGotItBtn.addEventListener("click", saveMonthlyInsightCollapsed);
    }

    if (els.monthlyInsightPracticeBtn) {
      els.monthlyInsightPracticeBtn.addEventListener("click", function () {
        const href = els.monthlyInsightPracticeBtn.dataset.href || "/support.html?source=monthly_insight";
        window.location.href = href;
      });
    }

    loadDashboard();
  });
})();
