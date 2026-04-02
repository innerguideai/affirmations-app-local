// pages/profile.page.js
// Profile page object for native iOS smoke test.
// Self-contained version to avoid helper dependency issues.

const FIXED_EMOTION_LABELS = [
  "Calm",
  "Anxious",
  "Sad",
  "Angry",
  "Tired",
  "Stressed",
  "Grateful",
  "Hopeful",
  "Focused",
  "Excited"
];

class ProfilePage {
  // Check if Profile is visible using the known good native signal.
  async isVisible(driver) {
    const elements = await driver.$$('~How are you feeling today?');
    return elements.length > 0;
  }

  // Wait for Profile to appear.
  async waitForVisible(driver, timeoutMs = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.isVisible(driver)) {
        return true;
      }

      await driver.pause(500);
    }

    return false;
  }

  // Read the best available visible label for a native button.
  async getButtonLabel(element) {
    const attrs = ["name", "label", "value"];

    for (const attr of attrs) {
      try {
        const value = await element.getAttribute(attr);

        if (value && String(value).trim()) {
          return String(value).trim();
        }
      } catch (_) {
        // ignore and continue
      }
    }

    return "";
  }

  // Get all visible native buttons with labels.
  async getVisibleNativeButtons(driver) {
    const elements = await driver.$$('//XCUIElementTypeButton');
    const out = [];

    for (const element of elements) {
      const label = await this.getButtonLabel(element);
      out.push({ element, label });
    }

    return out;
  }

  // Find fixed emotion buttons using real labels first, then fallback to known order.
  async getEmotionButtons(driver) {
    const buttons = await this.getVisibleNativeButtons(driver);

    const matched = buttons.filter((button) =>
      FIXED_EMOTION_LABELS.includes(button.label)
    );

    if (matched.length > 0) {
      return matched;
    }

    // fallback to previously proven button order
    return buttons.slice(1, 11);
  }

  // Tap a random fixed emotion.
  async tapRandomEmotion(driver) {
    const emotionButtons = await this.getEmotionButtons(driver);

    if (!emotionButtons.length) {
      throw new Error("Could not find any fixed emotion buttons");
    }

    const randomIndex = Math.floor(Math.random() * emotionButtons.length);
    const chosen = emotionButtons[randomIndex];

    console.log("Random emotion chosen:", chosen.label || `(index ${randomIndex})`);

    await chosen.element.click();
    console.log("Tapped random emotion button");
  }

  async hasNextAffirmation(driver) {
    const elements = await driver.$$('~Next affirmation');
    return elements.length > 0;
  }

  async hasNewAiAffirmation(driver) {
    const elements = await driver.$$('~New AI affirmation');
    return elements.length > 0;
  }

  async hasAnyAffirmationAction(driver) {
    if (await this.hasNextAffirmation(driver)) return true;
    if (await this.hasNewAiAffirmation(driver)) return true;
    return false;
  }

  async clickNextAffirmation(driver) {
    const elements = await driver.$$('~Next affirmation');
    if (!elements.length) return false;

    await elements[0].click();
    console.log('Tapped "Next affirmation"');
    return true;
  }

  async clickNewAiAffirmation(driver) {
    const elements = await driver.$$('~New AI affirmation');
    if (!elements.length) return false;

    await elements[0].click();
    console.log('Tapped "New AI affirmation"');
    return true;
  }

  async exerciseAffirmationActions(driver) {
    let nextClicks = 0;

    while (nextClicks < 2 && (await this.hasNextAffirmation(driver))) {
      await this.clickNextAffirmation(driver);
      nextClicks += 1;
      await driver.pause(1200);
    }

    if (nextClicks > 0) {
      console.log(`Clicked through ${nextClicks} saved affirmation(s)`);
      return;
    }

    if (await this.hasNewAiAffirmation(driver)) {
      await this.clickNewAiAffirmation(driver);
      await driver.pause(2500);

      const stillHasAction = await this.hasAnyAffirmationAction(driver);
      console.log("Post-AI action state available:", stillHasAction);
      return;
    }

    throw new Error("No affirmation action button was available");
  }
}

module.exports = new ProfilePage();