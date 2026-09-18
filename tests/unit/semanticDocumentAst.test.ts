import { createHash } from "node:crypto"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { describe, expect, it } from "vitest"
import {
  astSidecarPath,
  createAstFingerprint,
  DocumentAstStore,
} from "../../src/electron/documentAstStore"
import {
  composeAndCacheSemanticDocumentAst,
  composeSemanticDocumentForDocument,
} from "../../src/electron/semanticDocumentAstStore"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { deriveDocumentStructures } from "../../src/renderer/lib/documentStructures"
import {
  composeSemanticDocumentAst,
  SemanticDocumentAstCompositionError,
  semanticNodeIdSchema,
} from "../../src/renderer/lib/semanticDocumentAst"
import type { SourceDocumentAst } from "../../src/shared/documentAst"
import type { DocumentLayout } from "../../src/shared/documentLayout"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

const sourceHash = "a".repeat(64)

function textItem(str: string, x: number, baseline: number, width: number): TextItem {
  return {
    str,
    dir: "ltr",
    transform: [10, 0, 0, 10, x, baseline],
    width,
    height: 10,
    fontName: "Helvetica",
    hasEOL: true,
  }
}

function sourceFixture(): SourceDocumentAst {
  return buildSourceDocumentAst(sourceHash, [
    {
      page: 1,
      width: 600,
      height: 800,
      items: [
        textItem("1 Methods", 40, 740, 70),
        textItem("Body text [1].", 40, 710, 120),
        textItem("Figure 1 Overview", 40, 660, 130),
        textItem("Diagram pixels", 40, 570, 140),
        textItem("References [1] Rivera. 2024. Journal.", 40, 100, 300),
      ],
    },
  ])
}

function layoutFixture(source: SourceDocumentAst): DocumentLayout {
  return {
    version: 2,
    model: "PP-DocLayout_plus-L",
    sourceHash: source.sourceHash,
    pages: [
      {
        pageNumber: 1,
        width: 600,
        height: 800,
        boxes: [{ label: "image", score: 0.88, x: 35, y: 170, width: 220, height: 90 }],
      },
    ],
  }
}

describe("semantic document AST", () => {
  it("composes byte-stable semantics without changing source provenance", () => {
    // Given
    const source = sourceFixture()
    const sourceBefore = JSON.stringify(source)

    // When
    const first = composeSemanticDocumentAst({ source, layout: layoutFixture(source) })
    const second = composeSemanticDocumentAst({ source, layout: layoutFixture(source) })

    // Then
    expect(first).toEqual(second)
    expect(JSON.stringify(first.ast)).toBe(JSON.stringify(second.ast))
    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(first.ast.nodes.some((node) => node.kind === "heading")).toBe(true)
    expect(first.ast.edges.every((edge) => edge.confidence >= 0 && edge.origin.length > 0)).toBe(
      true,
    )
  })

  it("caches only a complete composition and leaves the source sidecar unchanged", async () => {
    // Given
    const source = sourceFixture()
    const root = await mkdtemp(join(tmpdir(), "semantic-ast-cache-"))
    const fingerprint = createAstFingerprint({
      sourceHash: source.sourceHash,
      extractorVersion: "test",
      configVersion: "semantic-test",
    })
    const sourceStore = new DocumentAstStore(root)
    await sourceStore.write(source, fingerprint)
    const sourcePath = astSidecarPath(root, source.sourceHash, fingerprint)
    const before = createHash("sha256")
      .update(await readFile(sourcePath))
      .digest("hex")

    // When
    const result = await composeAndCacheSemanticDocumentAst({
      composition: { source, layout: layoutFixture(source) },
      fingerprint,
      root,
    })
    const cached = await composeAndCacheSemanticDocumentAst({
      composition: { source, layout: layoutFixture(source) },
      fingerprint,
      root,
    })

    // Then
    const after = createHash("sha256")
      .update(await readFile(sourcePath))
      .digest("hex")
    expect(result.status).toBe("ready")
    expect(after).toBe(before)
    expect(result.cached).toBe(false)
    expect(cached.cached).toBe(true)
    expect(cached.ast).toEqual(result.ast)
  })

  it("composes from the registered document source sidecar without network work", async () => {
    // Given
    const source = sourceFixture()
    const root = await mkdtemp(join(tmpdir(), "semantic-ast-service-"))
    const document = documentRecordSchema.parse({
      id: documentIdSchema.parse("aabbccddeeff0011"),
      name: "synthetic.pdf",
      hash: source.sourceHash,
      bytes: 1,
      importedAt: "2026-09-01T00:00:00.000Z",
      pageCount: 1,
      title: "Synthetic",
      authors: [],
      year: null,
      doi: null,
      kind: "document",
      overview: "",
      quality: { textCharacters: 1, needsOcr: false, warnings: [] },
    })
    const fingerprint = createAstFingerprint({
      sourceHash: source.sourceHash,
      extractorVersion: "pdfjs-6-source-1",
      configVersion: "source-only-v1",
    })
    const store = new WorkspaceStore(root)
    await store.save({ ...defaultWorkspace(), documents: [document] })
    await new DocumentAstStore(root).write(source, fingerprint)

    // When
    const result = await composeSemanticDocumentForDocument({
      documentId: document.id,
      store,
    })

    // Then
    expect(result?.status).toBe("degraded")
    expect(result?.ast.sourceHash).toBe(source.sourceHash)
  })

  it("returns a degraded but text-capable artifact when layout is unavailable", () => {
    // Given
    const source = sourceFixture()

    // When
    const result = composeSemanticDocumentAst({ source })

    // Then
    expect(result.status).toBe("degraded")
    expect(result.ast.degradedReasons).toContain("layout_unavailable")
    expect(result.ast.nodes.some((node) => node.text.length > 0 && node.sourceRange)).toBe(true)
  })

  it("keeps optional local enrichment versioned and source-linked when evidence exists", () => {
    // Given
    const source = sourceFixture()

    // When
    const result = composeSemanticDocumentAst({
      source,
      localEnrichment: {
        schemaVersion: "1.0.0",
        status: "ready",
        sourceHash: source.sourceHash,
        model: "PP-StructureV3",
        modelVersion: "test",
        records: [
          {
            schemaVersion: "1.0.0",
            id: "local:ocr:1:0",
            kind: "ocr",
            targetKind: "scanned",
            pageNumber: 1,
            bounds: { x: 10, y: 10, width: 80, height: 30 },
            text: "local evidence",
            confidence: 0.6,
            origin: "local_pp_structure_v3",
            model: "PP-StructureV3",
            modelVersion: "test",
            sourceTextPolicy: "ocr_fallback",
          },
        ],
      },
    })

    // Then
    expect(result.ast.nodes.some((node) => node.id === "node:local-ocr-1-0")).toBe(true)
    expect(result.ast.nodes.find((node) => node.id === "node:local-ocr-1-0")?.origin).toBe(
      "local_ocr",
    )
  })

  it("rejects dangling and reused relations with typed errors", () => {
    // Given
    const source = sourceFixture()
    const page = source.pages[0]
    const visualItem = source.items[3]
    if (!page || !visualItem) throw new Error("semantic fixture is incomplete")
    const structures = deriveDocumentStructures(source, {
      visualRegions: [
        {
          id: "visual:figure-1",
          pageId: page.id,
          kind: "figure",
          sourceItemIds: [visualItem.id],
          bounds: { x: 40, y: 560, width: 160, height: 80 },
        },
      ],
    })
    const relation = structures.edges[0]
    if (!relation) throw new Error("semantic fixture must contain a caption relation")

    // When / Then
    expect(() =>
      composeSemanticDocumentAst({
        source,
        structures: { ...structures, edges: [relation, relation] },
      }),
    ).toThrowError(SemanticDocumentAstCompositionError)
    try {
      composeSemanticDocumentAst({
        source,
        structures: {
          ...structures,
          edges: [{ ...relation, to: semanticNodeIdSchema.parse("node:missing") }],
        },
      })
      throw new Error("expected dangling relation rejection")
    } catch (error) {
      expect(error).toBeInstanceOf(SemanticDocumentAstCompositionError)
      if (error instanceof SemanticDocumentAstCompositionError)
        expect(error.kind).toBe("dangling_relation")
    }
  })
})
