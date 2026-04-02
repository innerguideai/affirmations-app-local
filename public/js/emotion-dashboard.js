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

  function normalizeDashboardData(raw) {
    const summary = raw && raw.summary ? raw.summary : {};
    const charts = raw && raw.charts ? raw.charts : {};

    const top10 = safeArray(charts.top10).slice(0, 6);
    const trend = charts.trend || {};
    const heatmap = safeArray(charts.heatmap);

    return {
      summary: {
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

    loadDashboard();
  });
})();