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

    try {
      const first = await service.parse({ documentId, pageNumber: 1, store })
      const second = await service.parse({ documentId, pageNumber: 2, store })

      expect(first).toMatchObject({ status: "ready", page: { pageNumber: 1 } })
      expect(second).toMatchObject({ status: "ready", page: { pageNumber: 2 } })
      expect(process).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
