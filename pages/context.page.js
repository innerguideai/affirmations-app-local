// pages/context.page.js
// Context overlay page object for native iOS smoke test.
// Self-contained version to avoid helper dependency issues.

const CLOSE_LABELS = ["✕", "×", "X", "Close", "Dismiss", "Cancel"];

const NON_CONTEXT_LABELS = new Set([
  "Menu",
  "Default",
  "Winter",
  "Spring",
  "Calm",
  "Anxious",
  "Sad",
  "Angry",
  "Tired",
  "Stressed",
  "Grateful",
  "Hopeful",
  "Focused",
  "Excited",
  "Other...",
  "Next affirmation",
  "New AI affirmation"
]);

class ContextPage {
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

  async getCloseButtons(driver) {
    const buttons = await this.getVisibleNativeButtons(driver);

    return buttons.filter((button) => CLOSE_LABELS.includes(button.label));
  }

  async getContextOptionButtons(driver) {
    const buttons = await this.getVisibleNativeButtons(driver);

    return buttons.filter((button) => {
      const label = String(button.label || "").trim();

      if (!label) return false;
      if (CLOSE_LABELS.includes(label)) return false;
      if (NON_CONTEXT_LABELS.has(label)) return false;

      return true;
    });
  }

  async isVisible(driver) {
    const closeButtons = await this.getCloseButtons(driver);
    const optionButtons = await this.getContextOptionButtons(driver);

    return closeButtons.length > 0 && optionButtons.length > 0;
  }

  async dismissCurrentContext(driver, stageName = "context") {
    const closeButtons = await this.getCloseButtons(driver);

    if (!closeButtons.length) {
      return false;
    }

    await closeButtons[0].element.click();
    console.log(`Dismissed ${stageName} with close button`);
    return true;
  }

  async selectFirstOption(driver, stageName = "context") {
    const options = await this.getContextOptionButtons(driver);

    if (!options.length) {
      return false;
    }

    const chosen = options[0];
    console.log(`Selected ${stageName} option:`, chosen.label);

    await chosen.element.click();
    return true;
  }
}

module.exports = new ContextPage();