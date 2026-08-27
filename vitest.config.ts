import { defineConfig } from "vitest/config"

export const testConfig = defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
})

export default testConfig
