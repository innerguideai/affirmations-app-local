// tests/helpers/debug.js
// Debug helpers — dump page source / WebView state to disk on failure
// so we can inspect what the app actually showed without re-running.

const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '..', '..', 'tests-debug-output');

function ensureDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

// Saves the native XCUITest page source XML to tests-debug-output/<filename>
async function savePageSource(driver, filename = 'page-source.xml') {
  ensureDir();
  try {
    const src = await driver.getPageSource();
    const filePath = path.join(DEBUG_DIR, filename);
    fs.writeFileSync(filePath, src, 'utf8');
    console.log(`         [debug] page source saved → tests-debug-output/${filename}`);
    return filePath;
  } catch (err) {
    console.log(`         [debug] failed to save page source: ${err.message}`);
    return null;
  }
}

module.exports = { savePageSource, DEBUG_DIR };
