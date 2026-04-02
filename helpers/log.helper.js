// helpers/log.helper.js
// Small logging helpers for smoke tests.

function logAppiumStartup(appiumConfig) {
  console.log(
    "Starting Appium with device:",
    appiumConfig.capabilities["appium:deviceName"]
  );
  console.log(
    "Starting Appium with bundleId:",
    appiumConfig.capabilities["appium:bundleId"]
  );
}

module.exports = {
  logAppiumStartup
};
