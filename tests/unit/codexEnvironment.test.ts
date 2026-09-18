import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildCodexConfigToml,
  buildSanitizedCodexEnv,
  getCodexAppServerCliArgs,
} from "../../src/electron/codexEnvironment"

describe("Codex runtime environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses keyring storage without file or auto fallback", () => {
    const config = buildCodexConfigToml()
    const args = getCodexAppServerCliArgs()

    expect(config).toContain('cli_auth_credentials_store = "keyring"')
    expect(config).not.toMatch(/cli_auth_credentials_store = "(?:file|auto)"/)
    expect(args).toContain('cli_auth_credentials_store="keyring"')
    expect(args).not.toContain('cli_auth_credentials_store="file"')
    expect(args).not.toContain('cli_auth_credentials_store="auto"')
  })

  it("drops inherited paid API credentials while preserving app routing", () => {
    vi.stubEnv("PATH", "/inherited/bin")
    vi.stubEnv("OPENAI_API_KEY", "paid-api-secret")
    vi.stubEnv("CODEX_API_KEY", "paid-codex-secret")
    vi.stubEnv("OPENAI_BASE_URL", "https://api.example.invalid")

    const env = buildSanitizedCodexEnv("/app/codex-home", "/app/workdir")

    expect(env).toMatchObject({
      PATH: "/inherited/bin",
      CODEX_HOME: "/app/codex-home",
      HOME: "/app/workdir",
      XDG_CONFIG_HOME: "/app/codex-home",
    })
    expect(env).not.toHaveProperty("OPENAI_API_KEY")
    expect(env).not.toHaveProperty("CODEX_API_KEY")
    expect(env).not.toHaveProperty("OPENAI_BASE_URL")
  })
})
