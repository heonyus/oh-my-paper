import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { DocumentAstService } from "../../src/electron/documentAstService"
import { astSidecarPath, createAstFingerprint } from "../../src/electron/documentAstStore"
import type { PreparedPdf } from "../../src/electron/preparePdf"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import {
  addAstRangesToAnchor,
  resolveLegacyAnchor,
} from "../../src/renderer/lib/documentAstMigration"
import { documentIdSchema, documentRecordSchema, sha256Schema } from "../../src/shared/schemas"

const sourceHash = sha256Schema.parse("a".repeat(64))
const id = documentIdSchema.parse("aabbccddeeff0011")
const fingerprint = createAstFingerprint({
  sourceHash,
  extractorVersion: "pdfjs-6-source-1",
  configVersion: "source-only-v1",
})

function repeatedAst() {
  return buildSourceDocumentAst(sourceHash, [
    {
      page: 1,
      width: 600,
      height: 800,
      items: [
        {
          str: "Repeat",
          dir: "ltr",
          transform: [10, 0, 0, 10, 40, 740],
          width: 36,
          height: 10,
          fontName: "Helvetica",
          hasEOL: false,
        },
        {
          str: "Repeat",
          dir: "ltr",
          transform: [10, 0, 0, 10, 40, 700],
          width: 36,
          height: 10,
          fontName: "Helvetica",
          hasEOL: false,
        },
      ],
    },
  ])
}

describe("document AST migration", () => {
  it("marks repeated legacy quotes ambiguous and preserves the original anchor", () => {
    const ast = repeatedAst()
    const anchor = {
      page: 1,
      quote: "Repeat",
      x: 40,
      y: 50,
      fragments: [{ x: 40, y: 50, width: 36, height: 10 }],
    }
    const resolution = resolveLegacyAnchor(ast, anchor)

    expect(resolution.status).toBe("ambiguous")
    expect(addAstRangesToAnchor(ast, anchor)).toEqual(anchor)
  })

  it("rebuilds a malformed sidecar without changing the workspace or source", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-ast-migration-"))
    try {
      const document = documentRecordSchema.parse({
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
      const store = new WorkspaceStore(root)
      await store.save({ ...defaultWorkspace(), documents: [document] })
      await mkdir(join(root, "documents"), { recursive: true })
      await writeFile(join(root, "documents", `${sourceHash}.pdf`), "%PDF-", "utf8")
      await mkdir(join(root, "document-ast", sourceHash), { recursive: true })
      await writeFile(astSidecarPath(root, sourceHash, fingerprint), "broken", "utf8")
      const before = await store.read()
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
      const network = vi.fn()
      const result = await new DocumentAstService(store, {
        build: async () => prepared,
      }).request({ id, sourceHash, fingerprint })

      expect(result.status).toBe("ready")
      expect(await store.read()).toEqual(before)
      expect(network).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
