import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadParsedDocumentPage } from "../../src/renderer/lib/documentPageRuntime"
import {
  DocumentTranslationError,
  translateDocumentPages,
} from "../../src/renderer/lib/documentTranslationRunner"
import { translatePageBatch } from "../../src/renderer/lib/pageTranslationAi"
import {
  readCachedPageTranslation,
  storeCachedPageTranslation,
} from "../../src/renderer/lib/pageTranslationCacheRuntime"
import {
  type ParsedDocumentPage,
  parsedDocumentPageSchema,
} from "../../src/shared/documentPageModel"
import { documentRecordSchema } from "../../src/shared/schemas"

vi.mock("../../src/renderer/lib/documentPageRuntime", () => ({
  loadParsedDocumentPage: vi.fn(),
}))
vi.mock("../../src/renderer/lib/pageTranslationAi", () => ({
  translatePageBatch: vi.fn(),
}))
vi.mock("../../src/renderer/lib/pageTranslationCacheRuntime", () => ({
  readCachedPageTranslation: vi.fn(),
  storeCachedPageTranslation: vi.fn(),
}))

const document = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 3,
  title: "MedAgentGym",
  authors: ["Researcher"],
  year: 2026,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

const provider = { configured: true, provider: "openai", model: "gpt-5" } as const

function parsedPage(page: number): ParsedDocumentPage {
  return parsedDocumentPageSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash: "a".repeat(64),
    parser: "NativeText-1.0",
    configVersion: "v1",
    pageNumber: page,
    width: 600,
    height: 800,
    blocks: [
      {
        id: `page:${page}:block:1`,
        label: "text",
        order: 0,
        bounds: { x: 0, y: 0, width: 100, height: 20 },
        content: `Page ${page} body text.`,
        contentFormat: "text",
        translationPolicy: "include",
      },
    ],
  })
}

const loadParsed = vi.mocked(loadParsedDocumentPage)
const translate = vi.mocked(translatePageBatch)
const readCache = vi.mocked(readCachedPageTranslation)
const writeCache = vi.mocked(storeCachedPageTranslation)

beforeEach(() => {
  vi.clearAllMocks()
  loadParsed.mockImplementation(async (_id, page) => parsedPage(page))
  readCache.mockResolvedValue(null)
  writeCache.mockResolvedValue(undefined)
  translate.mockImplementation(async (input) => {
    const translated = new Map(input.batch.map((block) => [block.id, `번역:${block.id}`]))
    input.onPartial(translated)
    return translated
  })
})

function runnerInput(signal?: AbortSignal) {
  return {
    document,
    citations: [],
    provider,
    onAiRequest: vi.fn(async () => ""),
    signal: signal ?? new AbortController().signal,
    onProgress: vi.fn(),
    onPageBlocks: vi.fn(),
  }
}

describe("translateDocumentPages", () => {
  it("prepares the next page while the current page is translating", async () => {
    const events: string[] = []
    loadParsed.mockImplementation(async (_id, page) => {
      events.push(`parse:start:${page}`)
      await new Promise((resolve) => setTimeout(resolve, 0))
      return parsedPage(page)
    })
    translate.mockImplementation(async (input) => {
      events.push(`translate:start:${input.page}`)
      await new Promise((resolve) => setTimeout(resolve, 5))
      events.push(`translate:done:${input.page}`)
      return new Map(input.batch.map((block) => [block.id, `번역:${block.id}`]))
    })

    await translateDocumentPages(runnerInput())

    const order = (marker: string) => events.indexOf(marker)
    expect(order("parse:start:2")).toBeLessThan(order("translate:done:1"))
    expect(order("translate:done:1")).toBeLessThan(order("translate:start:2"))
    expect(order("translate:done:3")).toBeGreaterThan(-1)
  })

  it("stops scheduling translation once the signal is aborted", async () => {
    const controller = new AbortController()
    const input = runnerInput(controller.signal)
    translate.mockImplementation(async (batchInput) => {
      controller.abort()
      return new Map(batchInput.batch.map((block) => [block.id, `번역:${block.id}`]))
    })

    await translateDocumentPages(input)

    const translatedPages = translate.mock.calls.map(([call]) => call.page)
    expect(translatedPages).toEqual([1])
    const blockPages = vi.mocked(input.onPageBlocks).mock.calls.map(([page]) => page)
    expect(blockPages).not.toContain(2)
    expect(blockPages).not.toContain(3)
  })

  it("wraps a page preparation failure with its page and stage", async () => {
    loadParsed.mockImplementation(async (_id, page) => {
      if (page === 2) throw new Error("parser exploded")
      return parsedPage(page)
    })

    const failure = await translateDocumentPages(runnerInput()).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(DocumentTranslationError)
    expect(failure instanceof Error ? failure.message : "").toMatch(/page=2 stage=parse/u)
  })
})
