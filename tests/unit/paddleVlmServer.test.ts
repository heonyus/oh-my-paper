import { afterEach, describe, expect, it, vi } from "vitest"
import { paddleVlmServerEnvironment } from "../../src/electron/paddleVlmServer"

describe("Paddle MLX-VLM server", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("assembles an offline launch environment without inherited credential or proxy canaries", () => {
    vi.stubEnv("HOME", "/caller/home")
    vi.stubEnv("OPENAI_API_KEY", "canary-secret")
    vi.stubEnv("OAUTH_ACCESS_TOKEN", "canary-secret")
    vi.stubEnv("HTTPS_PROXY", "canary-secret")
    vi.stubEnv("CODEX_AUTH_TOKEN", "canary-secret")

    const environment = paddleVlmServerEnvironment("/runtime/home", "local-api-key")

    expect(environment).toMatchObject({
      HOME: "/caller/home",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_HOME: "/runtime/home/.cache/huggingface",
      NO_PROXY: "127.0.0.1,localhost",
      MLX_VLM_SERVER_API_KEY: "local-api-key",
    })
    expect(environment).not.toHaveProperty("OPENAI_API_KEY")
    expect(environment).not.toHaveProperty("OAUTH_ACCESS_TOKEN")
    expect(environment).not.toHaveProperty("HTTPS_PROXY")
    expect(environment).not.toHaveProperty("CODEX_AUTH_TOKEN")
  })
})
