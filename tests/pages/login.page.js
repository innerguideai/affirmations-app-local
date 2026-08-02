// tests/pages/login.page.js
// Login screen interactions.
// NOTE: WebView text fields expose empty name/label to XCUITest — use
// XPath @placeholderValue for native interaction, or JS for reliable fills.

const ls = require('../helpers/localStorage');
const { waitForScreen } = require('../helpers/screen');
const { NAV_WAIT_MS, LOGIN_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

class LoginPage {
  async navigateToLogin(driver) {
    await ls.navigateTo(driver, '/login.html');
    await driver.pause(NAV_WAIT_MS);
  }

  async isVisible(driver, timeoutMs = NAV_WAIT_MS) {
    return waitForScreen(driver, 'login', timeoutMs);
  }

  async fillEmail(driver, email) {
    const el = await driver.$('//XCUIElementTypeTextField[@placeholderValue="Email"]');
    await el.click();
    await el.clearValue();
    await el.setValue(email);
  }

  async fillPassword(driver, password) {
    const el = await driver.$('//XCUIElementTypeSecureTextField[@placeholderValue="Password"]');
    await el.click();
    await el.clearValue();
    await el.setValue(password);
  }

  async tapLoginButton(driver) {
    const btn = await driver.$('~Login');
    await btn.click();
  }

  // Fill + submit entirely via JS — most reliable path for WebView forms.
  // login.js reads emailEl.value / passEl.value at submit time.
  async loginViaJS(driver, email, password) {
    await ls.executeScript(driver, `
      var emailEl = document.getElementById('email');
      var passEl  = document.getElementById('password');
      if (emailEl) emailEl.value = ${JSON.stringify(email)};
      if (passEl)  passEl.value  = ${JSON.stringify(password)};
      var form = document.getElementById('loginForm');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    `);
  }

  // Convenience full flow used by the legacy smoke test
  async login(driver, user = TEST_USERS.JOHN) {
    await this.navigateToLogin(driver);

    let formReady = false;
    for (let i = 0; i < 20; i++) {
      try {
        const ok = await ls.executeScript(driver,
          "return document.getElementById('loginForm') !== null && document.getElementById('email') !== null"
        );
        if (ok) { formReady = true; break; }
      } catch (_) {}
      await driver.pause(400);
    }
    if (!formReady) throw new Error('LoginPage.login: loginForm not found');

    await this.loginViaJS(driver, user.email, user.password);
    return waitForScreen(driver, 'profile', LOGIN_TIMEOUT_MS);
  }

  async getStatus(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('loginStatus')?.textContent?.trim() || ''"
    );
  }
}

module.exports = new LoginPage();
