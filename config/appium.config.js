// config/appium.config.js
// Appium session config for local iOS simulator smoke test.

module.exports = {
  hostname: "127.0.0.1",
  port: 4723,
  path: "/",
  logLevel: "info",
  capabilities: {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": "iPhone 17 Pro",
    "appium:platformVersion": "26.1",
    "appium:bundleId": "com.innerguide.aiaffirm",
    "appium:noReset": true,
    "appium:newCommandTimeout": 120
  }
};