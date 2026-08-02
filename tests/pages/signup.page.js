// tests/pages/signup.page.js
// Signup screen interactions — all via JS (WebView form fields are not
// reliably addressable through native XCUITest selectors).

const ls = require('../helpers/localStorage');
const { waitForScreen } = require('../helpers/screen');
const { NAV_WAIT_MS } = require('../data/testConfig');

class SignupPage {
  async navigateToSignup(driver) {
    await ls.navigateTo(driver, '/signup.html');
    await driver.pause(NAV_WAIT_MS);
  }

  async isVisible(driver, timeoutMs = NAV_WAIT_MS) {
    return waitForScreen(driver, 'signup', timeoutMs);
  }

  async fillForm(driver, { firstName, lastName, email, password, confirmPassword }) {
    await ls.executeScript(driver, `
      var f = document.getElementById('firstName'); if (f) f.value = ${JSON.stringify(firstName || '')};
      var l = document.getElementById('lastName');  if (l) l.value = ${JSON.stringify(lastName || '')};
      var e = document.getElementById('email');     if (e) e.value = ${JSON.stringify(email || '')};
      var p = document.getElementById('password');  if (p) p.value = ${JSON.stringify(password || '')};
      var c = document.getElementById('confirmPassword'); if (c) c.value = ${JSON.stringify(confirmPassword || password || '')};
    `);
  }

  async submit(driver) {
    await ls.executeScript(driver, "document.getElementById('signupBtn')?.click()");
  }

  async getStatus(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('signupStatus')?.textContent?.trim() || ''"
    );
  }

  async isFormValid(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('signupForm')?.checkValidity()"
    );
  }
}

module.exports = new SignupPage();
