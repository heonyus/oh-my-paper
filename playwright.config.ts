import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  // The specs find controls by their Korean names, so the app is pinned to Korean.
  use: { trace: "retain-on-failure", locale: "ko-KR" },
})
