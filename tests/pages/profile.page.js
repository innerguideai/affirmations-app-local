// tests/pages/profile.page.js
// Profile / home screen interactions: emotion chips, tour overlay, support, etc.
// All checks go via JS (document.getElementById/querySelector) — WebView HTML
// ids do not map to native XCUITest accessibility identifiers.

const ls = require('../helpers/localStorage');
const { waitForScreen } = require('../helpers/screen');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');

class ProfilePage {
  async navigateToProfile(driver) {
    await ls.navigateTo(driver, '/profile.html');
    await driver.pause(NAV_WAIT_MS);
  }

  async isVisible(driver, timeoutMs = PAGE_TIMEOUT_MS) {
    return waitForScreen(driver, 'profile', timeoutMs);
  }

  async waitForVisible(driver, timeoutMs = PAGE_TIMEOUT_MS) {
    return this.isVisible(driver, timeoutMs);
  }

  // --- Emotion chips ---
  async getEmotionChips(driver) {
    return ls.executeScript(driver,
      "return Array.from(document.querySelectorAll('.emotion-chip')).map(el => el.dataset.emotion)"
    );
  }

  async tapEmotion(driver, emotion = 'calm') {
    await ls.executeScript(driver,
      `document.querySelector('.emotion-chip[data-emotion="${emotion}"]')?.click()`
    );
  }

  async tapRandomEmotion(driver) {
    await ls.executeScript(driver, `
      var chips = Array.from(document.querySelectorAll('.emotion-chip:not(.emotion-chip--other)'));
      if (chips.length) chips[Math.floor(Math.random() * chips.length)].click();
    `);
  }

  // --- Affirmation card / actions ---
  async hasAnyAffirmationAction(driver) {
    return ls.executeScript(driver, `
      var next = document.getElementById('nextBtn');
      var ai = document.getElementById('newAiBtn');
      return !!((next && !next.classList.contains('hidden')) ||
                (ai && !ai.classList.contains('hidden')));
    `);
  }

  async getAffirmationText(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('affirmationCard')?.textContent?.trim() || ''"
    );
  }

  async tapNextAffirmation(driver) {
    await ls.executeScript(driver, "document.getElementById('nextBtn')?.click()");
  }

  async tapNewAiAffirmation(driver) {
    await ls.executeScript(driver, "document.getElementById('newAiBtn')?.click()");
  }

  async exerciseAffirmationActions(driver) {
    const before = await this.getAffirmationText(driver);
    await this.tapNextAffirmation(driver);
    await driver.pause(1500);
    const after = await this.getAffirmationText(driver);
    return { before, after };
  }

  // --- Star rating ---
  async getStarRatingButtons(driver) {
    return ls.executeScript(driver,
      "return Array.from(document.querySelectorAll('#starRating .star')).length"
    );
  }

  async tapStar(driver, index = 0) {
    await ls.executeScript(driver,
      `document.querySelectorAll('#starRating .star')[${index}]?.click()`
    );
  }

  // --- Tour overlay ---
  async isTourVisible(driver) {
    return ls.executeScript(driver, `
      var tip = document.getElementById('ig-tour-tooltip');
      if (!tip) return false;
      var cs = window.getComputedStyle(tip);
      return tip.style.display !== 'none' && cs.display !== 'none' && cs.visibility !== 'hidden';
    `);
  }

  async tapTourSkip(driver) {
    await ls.executeScript(driver, "document.getElementById('ig-tour-skip')?.click()");
  }

  async tapTourNext(driver) {
    await ls.executeScript(driver, "document.getElementById('ig-tour-next')?.click()");
  }

  // --- Support banner ---
  async isSupportBannerVisible(driver) {
    return ls.executeScript(driver, `
      var el = document.getElementById('supportBanner');
      return !!(el && !el.classList.contains('hidden'));
    `);
  }

  async dismissSupportBanner(driver) {
    await ls.executeScript(driver, "document.getElementById('supportBannerClose')?.click()");
  }

  // --- Greeting / streak ---
  async getGreeting(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('greetingLine')?.textContent?.trim() || ''"
    );
  }

  async getStreakValue(driver) {
    return ls.executeScript(driver,
      "return document.getElementById('streakLine')?.textContent?.trim() || ''"
    );
  }

  // --- Theme toggle ---
  async tapThemeToggle(driver) {
    await ls.executeScript(driver, "document.getElementById('themeToggleButton')?.click()");
  }
}

module.exports = new ProfilePage();
