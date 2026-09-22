import { afterEach, describe, expect, it, vi } from "vitest"
import { documentRecordSchema } from "../../src/shared/schemas"
import { createLocalImporter } from "../../src/web/localImport"

const document = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "MedAgentGym",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

describe("createLocalImporter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uploads dropped files with bounded parallelism in token order", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const uploadOrder: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const file = init?.body
        uploadOrder.push(file instanceof File ? file.name : "?")
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return new Response(JSON.stringify({ document, duplicate: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }),
    )

    const importer = createLocalImporter()
    const names = ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf", "f.pdf", "g.pdf"]
    const tokens = names.map((name) =>
      importer.getDroppedFilePath(new File([new Uint8Array(8)], name, { type: "application/pdf" })),
    )

    const results = await importer.importDocumentPaths(tokens)

    expect(results).toHaveLength(names.length)
    expect(results.every((result) => result?.document.id === document.id)).toBe(true)
    expect(uploadOrder).toHaveLength(names.length)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it("stops picking up new files after an upload failure", async () => {
    const uploaded: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const file = init?.body
        if (file instanceof File) uploaded.push(file.name)
        if (file instanceof File && file.name === "bad.pdf") {
          return new Response(JSON.stringify({ error: "broken pdf" }), {
            status: 422,
            headers: { "content-type": "application/json" },
          })
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
        return new Response(JSON.stringify({ document, duplicate: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }),
    )

    const importer = createLocalImporter()
    const tokens = ["bad.pdf", "ok-a.pdf", "ok-b.pdf", "queued.pdf"].map((name) =>
      importer.getDroppedFilePath(new File([new Uint8Array(8)], name, { type: "application/pdf" })),
    )

    await expect(importer.importDocumentPaths(tokens)).rejects.toThrow()
    expect(uploaded).not.toContain("queued.pdf")
  })
})
