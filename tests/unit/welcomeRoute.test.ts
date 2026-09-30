// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defaultWorkspace } from "../../src/electron/workspaceStore"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"
import { readWelcomeSeen } from "../../src/server/welcomeStore"
import { documentRecordSchema } from "../../src/shared/schemas"
import { welcomeStatusSchema } from "../../src/shared/welcome"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-welcome-route-"))
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
  const call = async (method: "welcomeStatus" | "markWelcomeSeen") => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/rpc/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    return welcomeStatusSchema.parse(await response.json())
  }
  return { root, services, call, base: `http://127.0.0.1:${address.port}` }
}

describe("welcome routes", () => {
  it("shows the welcome once per fresh data folder", async () => {
    const { root, call } = await setup()
    expect(await call("welcomeStatus")).toEqual({ seen: false })

    expect(await call("markWelcomeSeen")).toEqual({ seen: true })
    expect(await call("welcomeStatus")).toEqual({ seen: true })
    const stored: unknown = JSON.parse(await readFile(join(root, "welcome.json"), "utf8"))
    expect(stored).toMatchObject({ seenAt: expect.any(String) })
  })

  it("treats a folder that already holds papers as welcomed", async () => {
    const { root, services, call } = await setup()
    const paper = documentRecordSchema.parse({
      id: "aabbccddeeff0011",
      name: "paper.pdf",
      hash: "a".repeat(64),
      bytes: 100,
      importedAt: "2026-09-03T00:00:00.000Z",
      pageCount: 1,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
      quality: { textCharacters: 100, needsOcr: false, warnings: [] },
    })
    await services.store.save({ ...defaultWorkspace(), documents: [paper] })

    expect(await call("welcomeStatus")).toEqual({ seen: true })
    expect(await readWelcomeSeen(root)).toBe(true)
  })
  it("passes the page being read to background analysis", async () => {
    const { services, base } = await setup()
    const focus = vi.spyOn(services.analysis, "focus")
    const response = await fetch(`${base}/api/rpc/setReadingFocus`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "aabbccddeeff0011", pageNumber: 3 }),
    })
    expect(response.status).toBe(200)
    expect(focus).toHaveBeenCalledWith("aabbccddeeff0011", 3)
  })
})
