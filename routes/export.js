// routes/export.js
// Exports a user's reflections as Markdown or printable HTML.
// Zero new packages; PDF can be done via browser "Print → Save as PDF".

const { ObjectId } = require("mongodb");

// ✅ Same TZ helper you used for streaks
const APP_TZ = "America/New_York";

// Format a Date as YYYY-MM-DD in APP_TZ
function ymdInTZ(date = new Date(), timeZone = APP_TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Parse YYYY-MM-DD safely; fallback to today if invalid
function parseYMD(s) {
  if (!s || typeof s !== "string") return null;
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // middle of day UTC to avoid TZ drift
  return isNaN(dt.getTime()) ? null : dt;
}

// Build Markdown string from reflections
function buildMarkdown({ userName = "User", fromYMD, toYMD, items = [] }) {
  const lines = [];
  lines.push(`# Reflections Export`);
  lines.push("");
  lines.push(`- **User:** ${userName}`);
  lines.push(`- **Range:** ${fromYMD} → ${toYMD}`);
  lines.push(`- **Generated:** ${ymdInTZ()}`);
  lines.push("");
  if (!items.length) {
    lines.push("_No reflections found in this range._");
    return lines.join("\n");
  }
  lines.push(`## Entries (${items.length})`);
  lines.push("");
  for (const it of items) {
    const day = it.day || ymdInTZ(it.createdAt);
    // text is optional in our app; keep it tidy
    const text = it.text && it.text.trim() ? `\n\n> ${it.text.trim().replace(/\n/g, "\n> ")}` : "";
    lines.push(`### ${day} — ${it.emotion}`);
    lines.push(text || "");
  }
  return lines.join("\n").trim() + "\n";
}

// Build simple HTML (print-friendly) from reflections
function buildHTML({ userName = "User", fromYMD, toYMD, items = [] }) {
  const rows = items.map((it) => {
    const day = it.day || ymdInTZ(it.createdAt);
    const text = it.text && it.text.trim() ? it.text.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") : "";
    return `
      <div style="margin-bottom:16px; padding:12px; border:1px solid #eee; border-radius:12px;">
        <div style="font-weight:600;">${day} — ${it.emotion}</div>
        ${text ? `<div style="margin-top:8px; color:#444;">${text}</div>` : ""}
      </div>
    `;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reflections Export</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @media print {
      @page { margin: 16mm; }
    }
    body { font-family: Arial, sans-serif; padding: 24px; background: #fff; color:#222; }
    h1 { margin: 0 0 8px 0; }
    .sub { color:#555; margin-bottom:24px; }
    .btn { padding:10px 14px; border-radius:10px; border:1px solid #ddd; cursor:pointer; }
    .btn:hover { background:#f7f7f7; }
  </style>
</head>
<body>
  <h1>Reflections Export</h1>
  <div class="sub">
    <div><strong>User:</strong> ${userName}</div>
    <div><strong>Range:</strong> ${fromYMD} → ${toYMD}</div>
    <div><strong>Generated:</strong> ${ymdInTZ()}</div>
  </div>
  <div style="margin-bottom:16px;">
    <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
  ${rows || "<em>No reflections found in this range.</em>"}
</body>
</html>`;
}

module.exports = function exportRoutes(db) {
  const router = require("express").Router();

  // GET /api/export
  // Query:
  //   format = md | html     (default: md)
  //   start  = YYYY-MM-DD    (default: 30 days ago)
  //   end    = YYYY-MM-DD    (default: today)
  //   userId can come from header x-user-id or ?userId=
  router.get("/", async (req, res) => {
    try {
      // Pull user id from header or query
      const userId = req.header("x-user-id") || req.query.userId;
      if (!userId) {
        return res.status(401).json({ error: "Missing userId (x-user-id header or ?userId=)" });
      }

      // Resolve range
      const todayYMD = ymdInTZ();
      const end = parseYMD(req.query.end) || parseYMD(todayYMD);
      const start = parseYMD(req.query.start) || new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000); // last 30 days
      const fromYMD = ymdInTZ(start);
      const toYMD = ymdInTZ(end);

      // Build query on day field (string YYYY-MM-DD) for easy range scan
      const reflectionsCol = db.collection("reflections");
      const usersCol = db.collection("users");

      // Pull user (for display name) — optional
      const user = await usersCol.findOne(
        { _id: new ObjectId(userId) },
        { projection: { firstName: 1, lastName: 1, email: 1 } }
      );
      const userName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User" : "User";

      // Query reflections by user + range on 'day'
      const items = await reflectionsCol
        .find({
          userId: new ObjectId(userId),
          day: { $gte: fromYMD, $lte: toYMD },
        })
        .sort({ day: 1, createdAt: 1 })
        .toArray();

      // Format
      const format = (req.query.format || "md").toLowerCase();

      if (format === "html" || format === "pdf") {
        // pdf is served as HTML to print; client uses Print → PDF
        const html = buildHTML({ userName, fromYMD, toYMD, items });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(html);
      }

      // default: markdown
      const md = buildMarkdown({ userName, fromYMD, toYMD, items });
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="reflections_${fromYMD}_to_${toYMD}.md"`);
      return res.status(200).send(md);
    } catch (err) {
      console.error("❌ /api/export error", err);
      return res.status(500).json({ error: "Server error generating export" });
    }
  });

  return router;
};
