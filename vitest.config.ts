import { configDefaults, defineConfig } from "vitest/config"

export const testConfig = defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      "tests/e2e/**",
      "apps/account-worker/tests/**",
      // Claude Code worktrees of this repository live here and carry their own copy of the tests.
      ".claude/**",
    ],
    setupFiles: ["./tests/setup.ts"],
  },
})

export default testConfig
