// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-login-routes-"))
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
  const rpc = (method: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${url}/api/rpc/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  return { services, rpc }
}

describe("browser subscription routes", () => {
  it("returns parsed account status without server paths when queried", async () => {
    const { services, rpc } = await setup()
    vi.spyOn(services.subscription, "getStatus").mockResolvedValue({
      available: true,
      authenticated: false,
      account: null,
      requiresOpenaiAuth: true,
      executablePath: "/private/runtime/codex",
    })

    const response = await rpc("codexGetStatus", {})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      available: true,
      authenticated: false,
      account: null,
      requiresOpenaiAuth: true,
    })
  })

  it("starts and cancels the requested login through the adapter", async () => {
    const { services, rpc } = await setup()
    const start = vi.spyOn(services.subscription, "startLogin").mockResolvedValue({
      type: "chatgpt",
      loginId: "login-test",
      authUrl: "https://auth.openai.com/test",
    })
    const cancel = vi.spyOn(services.subscription, "cancelLogin").mockResolvedValue()

    const started = await rpc("codexStartLogin", { type: "chatgpt" })
    const cancelled = await rpc("codexCancelLogin", { loginId: "login-test" })

    expect(started.status).toBe(200)
    expect(cancelled.status).toBe(200)
    expect(start).toHaveBeenCalledWith("chatgpt")
    expect(cancel).toHaveBeenCalledWith("login-test")
  })

  it("rejects cross-origin login attempts before touching the adapter", async () => {
    const { services, rpc } = await setup()
    const start = vi.spyOn(services.subscription, "startLogin")

    const response = await rpc("codexStartLogin", {}, { origin: "https://example.com" })

    expect(response.status).toBe(403)
    expect(start).not.toHaveBeenCalled()
  })

  it("rejects invalid login types and non-JSON form submissions", async () => {
    const { services, rpc } = await setup()
    const start = vi.spyOn(services.subscription, "startLogin")

    const invalid = await rpc("codexStartLogin", { type: "apiKey" })
    const form = await rpc("codexStartLogin", {}, { "content-type": "text/plain" })

    expect(invalid.ok).toBe(false)
    expect(form.ok).toBe(false)
    expect(start).not.toHaveBeenCalled()
  })
})
