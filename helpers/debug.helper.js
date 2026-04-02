// helpers/debug.helper.js
// Small debug helpers for smoke tests.

const fs = require("fs");

async function savePageSource(driver, filename) {
  const source = await driver.getPageSource();
  fs.writeFileSync(filename, source, "utf8");
  console.log(`Saved page source to ${filename}`);
}

module.exports = {
  savePageSource
};