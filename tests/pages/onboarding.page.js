// tests/pages/onboarding.page.js
// Onboarding screens: name, frequency, pathselection, firstaffirmation.

const ls = require('../helpers/localStorage');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');

class OnboardingPage {
  // --- Name screen ---
  async navigateToName(driver) {
    await ls.navigateTo(driver, '/name.html');
    await driver.pause(NAV_WAIT_MS);
  }

  async isNameScreenVisible(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('nameContinue') !== null"
    );
  }

  async fillName(driver, name) {
    await ls.executeScript(driver,
      `var el = document.getElementById('displayName'); if(el){ el.value=${JSON.stringify(name)}; el.dispatchEvent(new Event('input')); }`
    );
  }

  async tapNameContinue(driver) {
    await ls.executeScript(driver, "document.getElementById('nameContinue')?.click()");
  }

  async getStoredName(driver) {
    const stored = await ls.executeScript(driver,
      "return localStorage.getItem('ig_display_name') || localStorage.getItem('ig_name') || localStorage.getItem('firstName') || ''"
    );
    return stored;
  }

  // --- Frequency screen ---
  async navigateToFrequency(driver) {
    await ls.navigateTo(driver, '/frequency.html');
    await driver.pause(NAV_WAIT_MS);
  }

  async isFrequencyScreenVisible(driver) {
    // Frequency buttons use data-frequency attribute — check via JS
    return ls.executeScript(driver,
      "return document.querySelectorAll('[data-frequency]').length > 0"
    );
  }

  async selectFrequency(driver, value = 'daily') {
    await ls.executeScript(driver,
      `document.querySelector('[data-frequency="${value}"]')?.click()`
    );
  }

  async getStoredFrequency(driver) {
    return ls.getItem(driver, 'ig_frequency');
  }

  // --- Path selection screen ---
  async navigateToPathSelection(driver) {
    await ls.navigateTo(driver, '/pathselection.html');
    await driver.pause(NAV_WAIT_MS);
  }

  async isPathSelectionVisible(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('chooseGuest') !== null"
    );
  }

  async tapContinueAsGuest(driver) {
    await ls.executeScript(driver, "document.getElementById('chooseGuest')?.click()");
  }

  async tapCreateAccount(driver) {
    await ls.executeScript(driver, "document.getElementById('chooseAccount')?.click()");
  }

  // --- First affirmation screen ---
  async navigateToFirstAffirmation(driver) {
    await ls.navigateTo(driver, '/firstaffirmation.html');
    await driver.pause(NAV_WAIT_MS);
  }

  async isFirstAffirmationVisible(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('faChips') !== null"
    );
  }

  async getFirstAffirmationText(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('faText')?.textContent?.trim() || ''"
    );
  }
}

module.exports = new OnboardingPage();
