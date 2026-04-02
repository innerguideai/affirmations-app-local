// helpers/screen.helper.js
// Small app-level screen detection helper.
// This is not a page object because it decides between pages.

const LoginPage = require("../pages/login.page");
const ProfilePage = require("../pages/profile.page");

async function detectScreen(driver) {
  if (await ProfilePage.isVisible(driver)) return "profile";
  if (await LoginPage.isVisible(driver)) return "login";
  return "unknown";
}

module.exports = {
  detectScreen
};