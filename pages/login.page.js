// pages/login.page.js
// Login page object for native iOS smoke test.

const { TEST_EMAIL, TEST_PASSWORD } = require("../config/test.config");

class LoginPage {
  // Check if the native Login screen is visible.
  async isVisible(driver) {
    const email = await driver.$$('~Email');
    const password = await driver.$$('~Password');
    const login = await driver.$$('~Login');

    return email.length > 0 && password.length > 0 && login.length > 0;
  }

  // Perform login using the confirmed working selectors.
  async login(driver) {
    const emailField = await driver.$('~Email');
    const passwordField = await driver.$('~Password');
    const loginButton = await driver.$('~Login');

    await emailField.click();
    await emailField.setValue(TEST_EMAIL);

    await passwordField.click();
    await passwordField.setValue(TEST_PASSWORD);

    await loginButton.click();
  }
}

module.exports = new LoginPage();