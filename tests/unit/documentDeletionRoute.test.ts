// @vitest-environment node
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { defaultWorkspace } from "../../src/electron/workspaceStore"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

function record(seed: string, title: string) {
  return documentRecordSchema.parse({
    id: documentIdSchema.parse(seed.repeat(16)),
    name: `${title}.pdf`,
    hash: seed.repeat(64),
    bytes: 100,
    importedAt: "2026-09-03T00:00:00.000Z",
    pageCount: 2,
    title,
    authors: [],
    year: null,
    doi: null,
    kind: "research_paper",
    overview: "",
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-delete-route-"))
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
  const remove = (id: string) =>
    fetch(`http://127.0.0.1:${address.port}/api/documents/${id}`, { method: "DELETE" })
  return { root, services, remove }
}

describe("DELETE /api/documents/:id", () => {
  it("removes the record, the stored PDF and its hash-keyed caches but keeps other papers", async () => {
    const { root, services, remove } = await setup()
    const deleted = record("a", "Deleted paper")
    const kept = record("b", "Kept paper")
    await services.store.save({ ...defaultWorkspace(), documents: [deleted, kept] })
    const files = ({ id, hash }: { readonly id: string; readonly hash: string }) => [
      join(root, "documents", `${hash}.pdf`),
      join(root, "parsed-pages", hash, "page-1.json"),
      join(root, "document-ast", hash, "source.json"),
      join(root, "page-translations", hash, "config", "page-1.json"),
      join(root, "layout", `${id}.json`),
    ]
    for (const path of [...files(deleted), ...files(kept)]) {
      await mkdir(join(path, ".."), { recursive: true })
      await writeFile(path, "{}")
    }

    const response = await remove(deleted.id)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect((await services.store.read()).documents.map((document) => document.id)).toEqual([
      kept.id,
    ])
    for (const path of files(deleted)) expect(await exists(path)).toBe(false)
    for (const path of files(kept)) expect(await exists(path)).toBe(true)
  })

  it("answers 404 for an unknown document and 400 for a malformed id", async () => {
    const { remove } = await setup()

    expect((await remove("cccccccccccccccc")).status).toBe(404)
    expect((await remove("url")).status).toBe(400)
    expect((await remove("aaaaaaaaaaaaaaaa/base64")).status).toBe(400)
  })
})
