import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:5174/rbr-rally-creator-web/",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 5174",
    url: "http://localhost:5174/rbr-rally-creator-web/",
    reuseExistingServer: true,
  },
});
