// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// Target reale della PWA: iPhone / Safari. WebKit è il motore giusto, ma non è
// installato ovunque (l'ambiente remoto di Claude Code ha solo Chromium), quindi
// i progetti sono due e si scelgono con --project.
//
//   npm run test:e2e                → iphone-webkit  (macchina di Omar)
//   npm run test:e2e -- --project=iphone-chromium   (fallback, CI/remoto)

module.exports = defineConfig({
  testDir: "./e2e",
  // I test non toccano mai la rete vera (vedi e2e/support/supabase.js): se uno
  // si blocca, è un bug del test, non attesa di rete.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3000",
    // Il service worker fa cache-first su tutto: servirebbe bundle vecchi e
    // scavalcherebbe page.route(), rendendo i test non deterministici.
    serviceWorkers: "block",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  },

  projects: [
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
    {
      name: "iphone-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        // Scappatoia per gli ambienti con i browser preinstallati a una
        // revisione diversa da quella attesa dal pacchetto npm (es. il
        // container di Claude Code, dove `playwright install` non va eseguito):
        //   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
        // In locale non va impostata: Playwright usa il browser che ha scaricato.
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { BROWSER: "none" },
  },
});
