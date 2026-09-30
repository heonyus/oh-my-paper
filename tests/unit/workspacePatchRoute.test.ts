// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defaultWorkspace } from "../../src/electron/workspaceStore"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"
import { documentRecordSchema, sha256Schema, workspaceSchema } from "../../src/shared/schemas"
import { diffWorkspace } from "../../src/shared/workspacePatch"
import { saveLocalWorkspacePatch } from "../../src/web/localWorkspacePatch"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const close of cleanup.splice(0)) await close()
})

const document = documentRecordSchema.parse({
  id: "abababababababab",
  name: "paper.pdf",
  hash: "a".repeat(64),
  bytes: 100,
  importedAt: "2026-09-03T00:00:00.000Z",
  pageCount: 20,
  title: "Paper",
  authors: [],
  year: null,
  doi: null,
  overview: "Overview",
  quality: { textCharacters: 100, needsOcr: false, warnings: [] },
})

async function serve() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-patch-route-"))
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
  const origin = `http://127.0.0.1:${address.port}`
  const routeTo = (path: string) => {
    const nodeFetch = globalThis.fetch
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      expect(url).toBe("/api/workspace/patch")
      return nodeFetch(`${origin}${path}`, init)
    })
  }
  return { services, routeTo }
}

describe("POST /api/workspace/patch", () => {
  it("saves a page turn and answers with the new snapshot through the browser bridge", async () => {
    const { services, routeTo } = await serve()
    const saved = workspaceSchema.parse(
      await services.store.save({ ...defaultWorkspace(), documents: [document] }),
    )
    const turned = { ...saved, documents: [{ ...document, lastReadPage: 12 }] }
    routeTo("/api/workspace/patch")

    const result = await saveLocalWorkspacePatch({
      baseSnapshotToken: sha256Schema.parse(saved.snapshotToken),
      patch: diffWorkspace(saved, turned),
    })

    expect(result).toEqual({
      status: "saved",
      snapshotToken: expect.any(String),
      revision: saved.revision === undefined ? expect.any(Number) : saved.revision + 1,
      patch: {},
    })
    const persisted = await services.store.read()
    expect(persisted.documents[0]?.lastReadPage).toBe(12)
    expect(result.status === "saved" && result.snapshotToken).not.toBe(saved.snapshotToken)
  })

  it("answers 409 for an unknown base, which the bridge reports as a conflict", async () => {
    const { routeTo } = await serve()
    routeTo("/api/workspace/patch")

    await expect(
      saveLocalWorkspacePatch({ baseSnapshotToken: sha256Schema.parse("e".repeat(64)), patch: {} }),
    ).resolves.toEqual({ status: "conflict" })
  })

  it("reports a server without the route as unsupported", async () => {
    const { routeTo } = await serve()
    routeTo("/api/workspace/patch-from-a-future-version")

    await expect(
      saveLocalWorkspacePatch({ baseSnapshotToken: sha256Schema.parse("e".repeat(64)), patch: {} }),
    ).resolves.toEqual({ status: "unsupported" })
  })
})
