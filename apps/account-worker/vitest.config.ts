import path from "node:path"

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"))
const TEST_SIGNING_JWK =
  '{"kty":"EC","x":"xH5AslYiOhpLJHZZpBLPHQ0Fo1KH1naW0JZp9Ps85kg","y":"Y_c4lAlEK1PVVF0SFGNlUjGu8W9FLKaLZulu-BeQCX0","crv":"P-256","d":"HxM_97YI5j1A0NG41F4q8t_881jyuvCPlMXQvF4lWW0"}'

process.env.APP_JWT_SIGNING_JWK = TEST_SIGNING_JWK

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          APP_JWT_SIGNING_JWK: TEST_SIGNING_JWK,
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./tests/apply-migrations.ts"],
  },
})
