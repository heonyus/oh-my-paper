// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"
import type { ClaudeAccountStatus } from "../../src/shared/claudeTypes"
import { writeFakeClaudeCli } from "../support/fakeClaudeCli"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const close of cleanup.splice(0)) await close()
})

const loggedIn: ClaudeAccountStatus = {
  available: true,
  authenticated: true,
  email: "reader@example.test",
  subscriptionType: "max",
  loginPending: false,
  loginUrl: null,
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-claude-routes-"))
  vi.stubEnv("CLAUDE_PATH", await writeFakeClaudeCli(root))
  const config: WebServerConfig = {
    host: "127.0.0.1",
    port: 8799,
    dataDir: root,
    staticDir: root,
    provider: null,
    model: null,
    apiKeys: { openai: null, openrouter: null, gemini: null, groq: null },
  }
  const services = await createWebServices(config)
  const server = createLocalWebServer(config, services)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No HTTP address")
  cleanup.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await services.close()
    await rm(root, { recursive: true, force: true })
  })
  const url = `http://127.0.0.1:${address.port}`
  const rpc = (method: string, body: unknown) =>
    fetch(`${url}/api/rpc/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  return { root, services, rpc }
}

// The fake CLI is a POSIX shebang script, which Windows cannot start directly.
describe.skipIf(process.platform === "win32")("browser Claude subscription routes", () => {
  it("defaults a fresh install to Claude with Haiku 5.5", async () => {
    const { services } = await setup()
    vi.spyOn(services.claude, "getStatus").mockResolvedValue(loggedIn)

    await expect(services.providerStatus()).resolves.toMatchObject({
      configured: true,
      provider: "anthropic",
      mode: "claude",
      model: "claude-haiku-5-5",
      claudeModel: "claude-haiku-5-5",
      claudeEffort: "medium",
    })
  })

  it("returns the CLI login status and starts or cancels a login", async () => {
    const { services, rpc } = await setup()
    vi.spyOn(services.claude, "getStatus").mockResolvedValue(loggedIn)
    const start = vi
      .spyOn(services.claude, "startLogin")
      .mockResolvedValue({ ...loggedIn, authenticated: false, loginPending: true })
    const cancel = vi.spyOn(services.claude, "cancelLogin").mockResolvedValue(loggedIn)

    const status = await rpc("claudeGetStatus", {})
    const started = await rpc("claudeStartLogin", {})
    const cancelled = await rpc("claudeCancelLogin", {})

    expect(await status.json()).toEqual(loggedIn)
    expect(await started.json()).toMatchObject({ loginPending: true })
    expect(cancelled.status).toBe(200)
    expect(start).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect((await rpc("claudeStartLogin", { unexpected: true })).status).toBe(500)
  })

  it("persists the Claude model and effort when switching modes", async () => {
    const { root, services, rpc } = await setup()
    vi.spyOn(services.claude, "getStatus").mockResolvedValue(loggedIn)

    await rpc("saveAiMode", { mode: "chatgpt" })
    const response = await rpc("saveAiMode", {
      mode: "claude",
      claudeModel: "claude-opus-5",
      claudeEffort: "high",
    })

    expect(await response.json()).toMatchObject({
      mode: "claude",
      provider: "anthropic",
      claudeModel: "claude-opus-5",
      claudeEffort: "high",
    })
    const saved = JSON.parse(await readFile(join(root, "ai-mode.json"), "utf8"))
    expect(saved).toMatchObject({
      mode: "claude",
      claudeModel: "claude-opus-5",
      claudeEffort: "high",
    })
  })
})
