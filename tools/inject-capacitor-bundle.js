// tools/inject-capacitor-bundle.js
"use strict";

const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SCRIPT_TAG = `<script src="/js/capacitor.bundle.js"></script>`;

function injectIntoHtml(filePath) {
  const html = fs.readFileSync(filePath, "utf8");

  // Skip if already injected
  if (html.includes(SCRIPT_TAG)) return false;

  // Inject before the first existing </body> (best place)
  if (html.includes("</body>")) {
    const updated = html.replace("</body>", `  ${SCRIPT_TAG}\n</body>`);
    fs.writeFileSync(filePath, updated, "utf8");
    return true;
  }

  // If no </body>, append at end (fallback)
  fs.writeFileSync(filePath, `${html}\n${SCRIPT_TAG}\n`, "utf8");
  return true;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".html")) {
      const changed = injectIntoHtml(full);
      if (changed) console.log("[inject] added to", path.relative(process.cwd(), full));
    }
  }
}

walk(PUBLIC_DIR);
console.log("[inject] done");