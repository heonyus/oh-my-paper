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

describe("Mistral OCR 4.1 fallback", () => {
  it("keeps structural labels, bounds and confidence", () => {
    const [page] = parsedPagesFromMistralResponse(
      {
        model: "mistral-ocr-4-1",
        pages: [
          {
            index: 2,
            markdown: "Table 3",
            dimensions: { width: 1_000, height: 1_400 },
            confidence_scores: { average_page_confidence_score: 0.89 },
            blocks: [
              {
                type: "caption",
                top_left_x: 100,
                top_left_y: 80,
                bottom_right_x: 700,
                bottom_right_y: 140,
                content: "Table 3: Results.",
                confidence_scores: { average_content_confidence_score: 0.91 },
              },
              {
                type: "table",
                top_left_x: 100,
                top_left_y: 160,
                bottom_right_x: 900,
                bottom_right_y: 800,
                content: "| base | 6 |",
              },
            ],
          },
        ],
        usage_info: { pages_processed: 1 },
      },
      sha256Schema.parse("a".repeat(64)),
    )

    expect(page).toMatchObject({
      parser: "Mistral-OCR-4.1",
      pageNumber: 3,
      provenance: { model: "mistral-ocr-4-1", confidence: 0.89 },
    })
    expect(page?.blocks.map((block) => [block.label, block.confidence])).toEqual([
      ["table_title", 0.91],
      ["table", undefined],
    ])
  })

  it("processes the PDF once and reuses all page caches", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-mistral-parser-"))
    const sourceHash = sha256Schema.parse("b".repeat(64))
    const documentId = documentIdSchema.parse(sourceHash.slice(0, 16))
    const store = new WorkspaceStore(root)
    const document = documentRecordSchema.parse({
      id: documentId,
      name: "paper.pdf",
      hash: sourceHash,
      bytes: 12,
      importedAt: "2026-09-21T00:00:00.000Z",
      pageCount: 2,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
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
      await expect(service.parse({ documentId, pageNumber: 2, store })).resolves.toMatchObject({
        status: "ready",
        page: { pageNumber: 2 },
      })
      await expect(service.parse({ documentId, pageNumber: 1, store })).resolves.toMatchObject({
        status: "ready",
        page: { pageNumber: 1 },
      })
      expect(process).toHaveBeenCalledOnce()
    } finally {
      await store.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})
