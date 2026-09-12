import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 8181);
// The e2e data directory is recreated on every run so invitations and users never leak between runs.
export default defineConfig({
  testDir: process.env.SHOWCASE || process.env.SCREENSHOTS ? "showcase" : "test/e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "chrome"),
    video: process.env.SHOWCASE ? { mode: "on", size: { width: 1280, height: 800 } } : "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  outputDir: process.env.SHOWCASE ? "showcase/out" : "test-results",
  webServer: {
    // The showroom has no ARAG dependency; it needs a bootstrap administrator and a stable session
    // secret so the browser's cookie survives the whole run.
    command: [
      "SHOWROOM_SESSION_SECRET=e2e-session-secret-e2e-session-secret",
      "SHOWROOM_ADMIN_EMAIL=e2e-admin@showroom.test",
      "SHOWROOM_ADMIN_PASSWORD=lantern-quarry-fathom-77",
      "SHOWROOM_ADMIN_TOKEN_DOC_PROCESSING=e2e-doc-processing-admin-token",
      `PUBLIC_URL=http://127.0.0.1:${port}`,
      "RATE_LIMIT_RPS=0",
      "DATA_DIR=./data/e2e",
      `PORT=${port}`,
      "node src/index.ts",
    ].join(" "),
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
