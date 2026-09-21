// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"

const cleanup: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

describe("web scholarly metadata save", () => {
  it("writes through the local knowledge repository and returns duplicate state", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-discovery-save-"))
    const config: WebServerConfig = {
      host: "127.0.0.1",
      port: 8799,
      dataDir: root,
      staticDir: root,
      provider: null,
      model: null,
      mistralApiKey: null,
      apiKeys: { openai: null, openrouter: null, gemini: null, groq: null },
    }
    const services = await createWebServices(config)
    const server = createLocalWebServer(config, services)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No HTTP address")
    const url = `http://127.0.0.1:${address.port}`
    cleanup.push(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await services.close()
      await rm(root, { recursive: true, force: true })
    })

    const body = {
      item: {
        provider: "openalex",
        identity: {
          providerRecordId: "W-save-1",
          doi: "10.1234/save",
          arxivId: null,
          openAlexId: "W-save-1",
        },
        title: "A locally saved scholarly paper",
        authors: ["Researcher"],
        year: 2024,
        venue: "Journal",
        abstract: "Abstract.",
        landingUrl: "https://example.org/paper",
        citationCount: 2,
        access: {
          metadata: "available",
          abstract: "available",
          fullText: { state: "unavailable", url: null },
        },
      },
    }

    const save = async () =>
      fetch(`${url}/api/rpc/discoverySaveMetadata`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    const first = await (await save()).json()
    const second = await (await save()).json()
    const listed = await (
      await fetch(`${url}/api/rpc/discoveryListSavedMetadata`, { method: "POST" })
    ).json()

    expect(first.status).toBe("saved")
    expect(second.status).toBe("duplicate")
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]?.title).toBe("A locally saved scholarly paper")
    expect((await services.store.read()).documents).toHaveLength(0)
    expect(services.store.repository.findNodes({ kind: "paper" })).toHaveLength(1)
  })
})
