// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest"
import { buildOfflineSubprocessEnv } from "../../src/electron/offlineSubprocessEnvironment"

describe("offline subprocess environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("keeps platform context and explicit runtime settings without inheriting secrets", () => {
    vi.stubEnv("PATH", "/synthetic/bin")
    vi.stubEnv("HOME", "/caller/home")
    vi.stubEnv("OPENAI_API_KEY", "canary-secret")
    vi.stubEnv("OAUTH_ACCESS_TOKEN", "canary-secret")
    vi.stubEnv("HTTPS_PROXY", "canary-secret")
    vi.stubEnv("CODEX_AUTH_TOKEN", "canary-secret")

    const env = buildOfflineSubprocessEnv({
      HF_HUB_OFFLINE: "1",
      PADDLE_PDX_CACHE_HOME: "/caller/home/.paddlex",
    })

    expect(env).toMatchObject({
      PATH: "/synthetic/bin",
      HOME: "/caller/home",
      HF_HUB_OFFLINE: "1",
      PADDLE_PDX_CACHE_HOME: "/caller/home/.paddlex",
    })
    expect(env).not.toHaveProperty("OPENAI_API_KEY")
    expect(env).not.toHaveProperty("OAUTH_ACCESS_TOKEN")
    expect(env).not.toHaveProperty("HTTPS_PROXY")
    expect(env).not.toHaveProperty("CODEX_AUTH_TOKEN")
  })

  it("keeps the Windows home directory and runs Python in UTF-8 mode", () => {
    vi.stubEnv("USERPROFILE", "C:\\Users\\reader")
    vi.stubEnv("USERNAME", "reader")
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\reader\\AppData\\Local")

    expect(buildOfflineSubprocessEnv({})).toMatchObject({
      USERPROFILE: "C:\\Users\\reader",
      USERNAME: "reader",
      LOCALAPPDATA: "C:\\Users\\reader\\AppData\\Local",
      PYTHONUTF8: "1",
    })
  })
})
