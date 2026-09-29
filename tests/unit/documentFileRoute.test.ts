// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { type IncomingHttpHeaders, request } from "node:http"
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

const pdfBytes = Buffer.from("%PDF-1.4\n% synthetic fixture bytes\n%%EOF\n")

function record(seed: string) {
  return documentRecordSchema.parse({
    id: documentIdSchema.parse(seed.repeat(16)),
    name: "paper.pdf",
    hash: seed.repeat(64),
    bytes: pdfBytes.byteLength,
    importedAt: "2026-09-03T00:00:00.000Z",
    pageCount: 1,
    title: "Synthetic paper",
    authors: [],
    year: null,
    doi: null,
    kind: "research_paper",
    overview: "",
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })
}

type RawResponse = {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly body: Buffer
}

function send(
  url: string,
  method: "GET" | "HEAD",
  headers: Readonly<Record<string, string>> = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method, headers }, (incoming) => {
      const chunks: Buffer[] = []
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk))
      incoming.on("end", () =>
        resolve({
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          body: Buffer.concat(chunks),
        }),
      )
    })
    outgoing.on("error", reject)
    outgoing.end()
  })
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-document-file-"))
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
  const stored = record("a")
  const missing = record("b")
  await services.store.save({ ...defaultWorkspace(), documents: [stored, missing] })
  await mkdir(services.store.documentsDirectory, { recursive: true })
  await writeFile(join(services.store.documentsDirectory, `${stored.hash}.pdf`), pdfBytes)
  return { origin: `http://127.0.0.1:${address.port}`, stored, missing }
}

describe("GET /api/documents/:id/file", () => {
  it("streams the stored PDF bytes with a content-hash entity tag", async () => {
    const { origin, stored } = await setup()

    const response = await send(`${origin}/api/documents/${stored.id}/file`, "GET", { origin })

    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toBe("application/pdf")
    expect(response.headers["content-length"]).toBe(String(pdfBytes.byteLength))
    expect(response.headers.etag).toBe(`"${stored.hash}"`)
    expect(response.headers["cache-control"]).toBe("private, no-cache")
    expect(response.body.equals(pdfBytes)).toBe(true)
  })

  it("answers a matching revalidation with 304 and HEAD without a body", async () => {
    const { origin, stored } = await setup()
    const url = `${origin}/api/documents/${stored.id}/file`

    const revalidated = await send(url, "GET", { "if-none-match": `W/"${stored.hash}"` })
    const head = await send(url, "HEAD")

    expect(revalidated.status).toBe(304)
    expect(revalidated.body.byteLength).toBe(0)
    expect(head.status).toBe(200)
    expect(head.headers["content-length"]).toBe(String(pdfBytes.byteLength))
    expect(head.body.byteLength).toBe(0)
  })

  it("answers 404 for an unknown paper or a missing file and 400 for a malformed id", async () => {
    const { origin, missing } = await setup()

    const unknown = await send(`${origin}/api/documents/cccccccccccccccc/file`, "GET")
    const absent = await send(`${origin}/api/documents/${missing.id}/file`, "GET")
    const malformed = await send(`${origin}/api/documents/not-an-id/file`, "GET")

    expect(unknown.status).toBe(404)
    expect(JSON.parse(unknown.body.toString("utf8"))).toEqual({ error: "document_not_found" })
    expect(absent.status).toBe(404)
    expect(JSON.parse(absent.body.toString("utf8"))).toEqual({ error: "document_file_missing" })
    expect(malformed.status).toBe(400)
  })

  it("keeps the loopback origin guard in front of the PDF bytes", async () => {
    const { origin, stored } = await setup()
    const url = `${origin}/api/documents/${stored.id}/file`

    const foreign = await send(url, "GET", { origin: "http://localhost:9999" })
    const crossSite = await send(url, "GET", { "sec-fetch-site": "cross-site" })
    const foreignHost = await send(url, "GET", { host: "attacker.example" })

    for (const response of [foreign, crossSite, foreignHost]) {
      expect(response.status).toBe(403)
      expect(response.body.includes(pdfBytes)).toBe(false)
    }
  })
})
