// pages/my-affirmations.page.js
// My Affirmations page object for native iOS smoke test.
// Self-contained, mirrors the style of pages/profile.page.js.
//
// Selector confidence:
// - Listen / Remove buttons: HIGH confidence — explicit aria-labels exist
//   in the app code ("Listen to affirmation", "Remove from My Affirmations",
//   "Confirm remove from My Affirmations", "Close to account").
// - Menu button / "My affirmations" row: LOWER confidence — the menu button
//   has an aria-label ("Menu"), but the account row itself does not, so
//   text-content matching is used instead (same technique profile.page.js
//   already uses for emotion buttons). Verify against a live page-source
//   dump if this doesn't find the row on first run.

class MyAffirmationsPage {
  // ---- Navigation (menu -> account -> My affirmations row) ----

  async openMenu(driver) {
    const elements = await driver.$$('~Menu');
    if (!elements.length) return false;

    await elements[0].click();
    console.log("Tapped profile menu button");
    return true;
  }

  async tapMyAffirmationsRow(driver) {
    // No explicit aria-label on this row in current markup — match by
    // visible text content instead.
    const elements = await driver.$$(
      '//*[contains(@name,"My affirmations") or contains(@label,"My affirmations")]'
    );
    if (!elements.length) return false;

    await elements[0].click();
    console.log('Tapped "My affirmations" row');
    return true;
  }

  async navigateFromProfile(driver) {
    const menuOpened = await this.openMenu(driver);
    if (!menuOpened) {
      console.log("Could not find Menu button");
      return false;
    }

    await driver.pause(800);

    const rowTapped = await this.tapMyAffirmationsRow(driver);
    if (!rowTapped) {
      console.log('Could not find "My affirmations" row on Account page');
      return false;
    }

    await driver.pause(800);
    return true;
  }

  async closeToAccount(driver) {
    const elements = await driver.$$("~Close to account");
    if (!elements.length) return false;

    await elements[0].click();
    console.log("Tapped close (My Affirmations -> Account)");
    return true;
  }

  // ---- Detection ----

  async isVisible(driver) {
    const titleMatch = await driver.$$(
      '//*[contains(@name,"My Affirmations") or contains(@label,"My Affirmations")]'
    );
    if (titleMatch.length > 0) return true;

    const subtitleMatch = await driver.$$(
      '//*[contains(@name,"Your affirmations from the last 30 days") or contains(@label,"Your affirmations from the last 30 days")]'
    );
    return subtitleMatch.length > 0;
  }

  async waitForVisible(driver, timeoutMs = 8000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.isVisible(driver)) {
        return true;
      }

      await driver.pause(400);
    }

    return false;
  }

  async isEmptyState(driver) {
    const elements = await driver.$$(
      '//*[contains(@name,"No affirmations from the last 30 days") or contains(@label,"No affirmations from the last 30 days")]'
    );
    return elements.length > 0;
  }

  // ---- List items ----

  async getListenButtons(driver) {
    return driver.$$("~Listen to affirmation");
  }

  async getRemoveButtons(driver) {
    return driver.$$("~Remove from My Affirmations");
  }

  async hasAnyItem(driver) {
    const listenButtons = await this.getListenButtons(driver);
    return listenButtons.length > 0;
  }

  // ---- Actions ----

  async tapListen(driver, index = 0) {
    const buttons = await this.getListenButtons(driver);
    if (!buttons[index]) return false;

    await buttons[index].click();
    console.log("Tapped Listen on My Affirmations item", index);
    return true;
  }

  // Two-tap remove: first tap arms the confirm state, second tap removes.
  // Returns "removed", "armed-only" (confirm state not detected), or false
  // (no remove button found at all).
  async removeItem(driver, index = 0) {
    const before = await this.getRemoveButtons(driver);
    if (!before[index]) return false;

    await before[index].click();
    console.log("First tap on Remove (arm confirm state)");
    await driver.pause(500);

    const confirmButtons = await driver.$$(
      "~Confirm remove from My Affirmations"
    );
    if (!confirmButtons.length) {
      console.log("Confirm state not detected after first tap");
      return "armed-only";
    }

    await confirmButtons[0].click();
    console.log("Second tap on Remove (confirmed)");
    await driver.pause(800);
    return "removed";
  }
}

module.exports = new MyAffirmationsPage();
