import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "startup-gps.spec.ts",
  timeout: 45000,
  use: {
    browserName: "webkit",
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    permissions: ["geolocation"],
    geolocation: { latitude: 24.7136, longitude: 46.6753 },
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
