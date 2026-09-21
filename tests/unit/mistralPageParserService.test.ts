// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { parsedPagesFromMistralResponse } from "../../src/electron/mistralOcrResponse"
import { MistralPageParserService } from "../../src/electron/mistralPageParserService"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema, documentRecordSchema, sha256Schema } from "../../src/shared/schemas"

function responsePage(index: number) {
  return {
    index,
    markdown: "Paragraph",
    dimensions: { width: 1_000, height: 1_400, dpi: 200 },
    blocks: [
      {
        type: "text" as const,
        top_left_x: 100,
        top_left_y: 180,
        bottom_right_x: 700,
        bottom_right_y: 320,
        content: `Paragraph ${index + 1}.`,
      },
    ],
  }
}

describe("Mistral OCR page conversion", () => {
  it("preserves page indexes and classifies numbered captions by their semantic kind", () => {
    const [page] = parsedPagesFromMistralResponse(
      {
        model: "mistral-ocr-4-1",
        pages: [
          {
            index: 8,
            markdown: "Table 3",
            dimensions: { width: 1_000, height: 1_400, dpi: 200 },
            confidence_scores: {
              average_page_confidence_score: 0.89,
              minimum_page_confidence_score: 0.77,
            },
            blocks: [
              {
                type: "caption",
                top_left_x: 100,
                top_left_y: 80,
                bottom_right_x: 700,
                bottom_right_y: 140,
                content: "Table 3: Variations on the Transformer architecture.",
                confidence_scores: {
                  average_content_confidence_score: 0.91,
                  minimum_content_confidence_score: 0.83,
                  block_type_confidence_score: 0.97,
                },
              },
              {
                type: "table",
                top_left_x: 100,
                top_left_y: 160,
                bottom_right_x: 900,
                bottom_right_y: 800,
                content: "| base | 6 |",
              },
              {
                type: "references",
                top_left_x: 100,
                top_left_y: 820,
                bottom_right_x: 900,
                bottom_right_y: 900,
                content: "[1] Vaswani et al.",
              },
            ],
          },
        ],
        usage_info: { pages_processed: 1 },
      },
      sha256Schema.parse("a".repeat(64)),
    )

    expect(page).toMatchObject({
      pageNumber: 9,
      provenance: { model: "mistral-ocr-4-1", pageIndex: 8, confidence: 0.89 },
    })
    expect(page?.blocks.map((block) => block.label)).toEqual(["table_title", "table", "references"])
    expect(page?.blocks[0]?.confidence).toBe(0.91)
    expect(page?.blocks[0]?.id).toBe("page:9:block:0")
  })

  it("keeps reading order and excludes visual content from translation", () => {
    const pages = parsedPagesFromMistralResponse(
      {
        model: "mistral-ocr-4-1",
        pages: [
          {
            index: 0,
            markdown: "# Results",
            dimensions: { width: 1_000, height: 1_400, dpi: 200 },
            blocks: [
              {
                type: "title",
                top_left_x: 100,
                top_left_y: 80,
                bottom_right_x: 700,
                bottom_right_y: 140,
                content: "Results",
              },
              {
                type: "text",
                top_left_x: 100,
                top_left_y: 180,
                bottom_right_x: 700,
                bottom_right_y: 320,
                content: "The model improved accuracy.",
              },
              {
                type: "image",
                top_left_x: 100,
                top_left_y: 360,
                bottom_right_x: 900,
                bottom_right_y: 900,
                content: "",
              },
              {
                type: "equation",
                top_left_x: 160,
                top_left_y: 940,
                bottom_right_x: 840,
                bottom_right_y: 1_020,
                content: "E = mc^2",
              },
            ],
          },
        ],
        usage_info: { pages_processed: 1 },
      },
      sha256Schema.parse("a".repeat(64)),
    )

    expect(pages).toHaveLength(1)
    expect(pages[0]?.parser).toBe("Mistral-OCR-4.1")
    expect(
      pages[0]?.blocks.map(({ label, order, translationPolicy }) => ({
        label,
        order,
        translationPolicy,
      })),
    ).toEqual([
      { label: "paragraph_title", order: 0, translationPolicy: "include" },
      { label: "text", order: 1, translationPolicy: "include" },
      { label: "image", order: 2, translationPolicy: "exclude" },
      { label: "equation", order: 3, translationPolicy: "include" },
    ])
  })

  it("processes one PDF once and reuses every page cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-mistral-parser-"))
    const sourceHash = sha256Schema.parse("b".repeat(64))
    const documentId = documentIdSchema.parse(sourceHash.slice(0, 16))
    const store = new WorkspaceStore(root)
    const document = documentRecordSchema.parse({
      id: documentId,
      name: "paper.pdf",
      hash: sourceHash,
      bytes: 12,
      importedAt: "2026-09-03T00:00:00.000Z",
      pageCount: 2,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
      overview: "",
      quality: { textCharacters: 12, needsOcr: false, warnings: [] },
    })
    await mkdir(store.documentsDirectory, { recursive: true })
    await writeFile(join(store.documentsDirectory, `${sourceHash}.pdf`), "%PDF-fixture", "utf8")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    const process = vi.fn(async () => ({
      model: "mistral-ocr-4-1",
      pages: [responsePage(0), responsePage(1)],
      usage_info: { pages_processed: 2 },
    }))
    const service = new MistralPageParserService(
      { apiKey: async () => "mistral-example-key-at-least-twenty-characters" },
      { process },
    )
    const progress = vi.fn()

    try {
      const first = await service.parse({ documentId, pageNumber: 2, store, onProgress: progress })
      const second = await service.parse({ documentId, pageNumber: 1, store })

      expect(first).toMatchObject({ status: "ready", page: { pageNumber: 2 } })
      expect(second).toMatchObject({ status: "ready", page: { pageNumber: 1 } })
      expect(progress.mock.calls.map(([value]) => value.pageNumber)).toEqual([2, 2, 2, 2])
      expect(process).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("does not abort shared OCR when one page consumer cancels", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-mistral-abort-"))
    const sourceHash = sha256Schema.parse("c".repeat(64))
    const documentId = documentIdSchema.parse(sourceHash.slice(0, 16))
    const store = new WorkspaceStore(root)
    const document = documentRecordSchema.parse({
      id: documentId,
      name: "paper.pdf",
      hash: sourceHash,
      bytes: 12,
      importedAt: "2026-09-03T00:00:00.000Z",
      pageCount: 1,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
      overview: "",
      quality: { textCharacters: 12, needsOcr: false, warnings: [] },
    })
    await mkdir(store.documentsDirectory, { recursive: true })
    await writeFile(join(store.documentsDirectory, `${sourceHash}.pdf`), "%PDF-fixture", "utf8")
    await store.save({ ...defaultWorkspace(), documents: [document] })
    let resolveResponse: ((value: unknown) => void) | undefined
    const pendingResponse = new Promise<unknown>((resolve) => {
      resolveResponse = resolve
    })
    const process = vi.fn(() => pendingResponse)
    const service = new MistralPageParserService(
      { apiKey: async () => "mistral-example-key-at-least-twenty-characters" },
      { process },
    )
    const firstController = new AbortController()

    try {
      const first = service.parse({
        documentId,
        pageNumber: 1,
        store,
        signal: firstController.signal,
      })
      const second = service.parse({ documentId, pageNumber: 1, store })
      await vi.waitFor(() => expect(process).toHaveBeenCalledOnce())
      firstController.abort(new Error("first consumer cancelled"))
      await expect(first).resolves.toEqual({ status: "unavailable", reason: "execution_failed" })
      resolveResponse?.({
        model: "mistral-ocr-4-1",
        pages: [responsePage(0)],
        usage_info: { pages_processed: 1 },
      })
      await expect(second).resolves.toMatchObject({ status: "ready" })
      expect(process).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
