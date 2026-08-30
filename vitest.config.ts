import { configDefaults, defineConfig } from "vitest/config"

export const testConfig = defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    setupFiles: ["./tests/setup.ts"],
  },
})

export default testConfig
