import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { DocumentAstService } from "../../src/electron/documentAstService"
import { createAstFingerprint } from "../../src/electron/documentAstStore"
import type { PreparedPdf } from "../../src/electron/preparePdf"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentAstRequestSchema, documentAstResultSchema } from "../../src/shared/documentAstIpc"
import { documentIdSchema, documentRecordSchema, sha256Schema } from "../../src/shared/schemas"

const id = documentIdSchema.parse("aabbccddeeff0011")
const sourceHash = sha256Schema.parse("a".repeat(64))
const fingerprint = createAstFingerprint({
  sourceHash,
  extractorVersion: "pdfjs-6-source-1",
  configVersion: "source-only-v1",
})

function document() {
  return documentRecordSchema.parse({
    id,
    name: "synthetic.pdf",
    hash: sourceHash,
    bytes: 5,
    importedAt: "2026-08-31T00:00:00.000Z",
    pageCount: 1,
    title: "Synthetic",
    authors: [],
    year: null,
    doi: null,
    kind: "document",
    overview: "",
    quality: { textCharacters: 0, needsOcr: true, warnings: [] },
  })
}

describe("document:ast IPC contract and service", () => {
  it("parses valid requests/results and rejects traversal-like or oversized identity input", () => {
    const request = documentAstRequestSchema.parse({ id, sourceHash, fingerprint })
    const ast = buildSourceDocumentAst(sourceHash, [
      { page: 1, width: 600, height: 800, items: [] },
    ])
    expect(
      documentAstResultSchema.parse({ status: "ready", sourceHash, fingerprint, ast }),
    ).toMatchObject({ status: "ready" })
    expect(() =>
      documentAstRequestSchema.parse({ id: "../../workspace", sourceHash, fingerprint }),
    ).toThrow()
    expect(request.id).toBe(id)
  })

  it("coalesces local rebuilds and returns safe stale/unknown states", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-ast-ipc-"))
    try {
      const store = new WorkspaceStore(root)
      await store.save({ ...defaultWorkspace(), documents: [document()] })
      await mkdir(join(root, "documents"), { recursive: true })
      await writeFile(join(root, "documents", `${sourceHash}.pdf`), "%PDF-", "utf8")
      const ast = buildSourceDocumentAst(sourceHash, [
        { page: 1, width: 600, height: 800, items: [] },
      ])
      const prepared: PreparedPdf = {
        hash: sourceHash,
        pageCount: 1,
        title: "Synthetic",
        authors: [],
        year: null,
        doi: null,
        kind: "document",
        overview: "",
        sourceAst: ast,
        pages: [{ page: 1, width: 600, height: 800, text: "" }],
        anchors: [],
        quality: { textCharacters: 0, needsOcr: true, warnings: [] },
      }
      const build = vi.fn(async (): Promise<PreparedPdf> => prepared)
      const service = new DocumentAstService(store, { build })
      const requests = { id, sourceHash, fingerprint }

      const [first, second] = await Promise.all([
        service.request(requests),
        service.request(requests),
      ])

      expect(first.status).toBe("ready")
      expect(second).toEqual(first)
      expect(build).toHaveBeenCalledOnce()
      await expect(
        service.request({ id, sourceHash: sha256Schema.parse("b".repeat(64)), fingerprint }),
      ).resolves.toEqual({ status: "failed", reason: "stale_source" })
      await expect(
        service.request({ id: documentIdSchema.parse("bbccddeeff001122") }),
      ).resolves.toEqual({ status: "failed", reason: "unknown_document" })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
