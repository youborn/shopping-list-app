// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    headless: true,
  },
});
