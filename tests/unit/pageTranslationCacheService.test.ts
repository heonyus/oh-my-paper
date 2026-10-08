// @vitest-environment node

import { mkdtemp, readdir, readFile, rm, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { PageTranslationCacheService } from "../../src/electron/pageTranslationCacheService"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

describe("PageTranslationCacheService", () => {
  it("restores completed translations across service instances and isolates models", async () => {
    const root = await mkdtemp(join(tmpdir(), "translation-cache-test-"))
    const store = new WorkspaceStore(root)
    const id = documentIdSchema.parse("aabbccddeeff0011")
    await store.save({
      ...defaultWorkspace(),
      documents: [
        documentRecordSchema.parse({
          id,
          name: "paper.pdf",
          hash: "c".repeat(64),
          bytes: 100,
          importedAt: "2026-09-03T00:00:00.000Z",
          pageCount: 2,
          title: "Paper",
          authors: [],
          year: null,
          doi: null,
          kind: "research_paper",
          overview: "",
          quality: { textCharacters: 100, needsOcr: false, warnings: [] },
        }),
      ],
    })
    const request = {
      id,
      pageNumber: 1,
      targetLanguage: "ko" as const,
      provider: "openrouter" as const,
      model: "translation-model-a",
      parser: "PDF.js+PaddleOCR-VL-1.6" as const,
      parserConfigVersion: "blocks-v2",
    }
    const blocks = [
      {
        id: "page:1:block:0:sentence:1",
        kind: "body" as const,
        source: "Hello.",
        translation: "안녕하세요.",
        sourceParser: "PDF.js+PaddleOCR-VL-1.6" as const,
        sourceParserConfigVersion: "blocks-v2",
      },
    ]

    try {
      await new PageTranslationCacheService(store).write({ ...request, blocks })
      const restored = await new PageTranslationCacheService(store).read(request)
      const otherModel = await new PageTranslationCacheService(store).read({
        ...request,
        model: "translation-model-b",
      })

      expect(restored).toEqual({ status: "ready", blocks })
      expect(
        await new PageTranslationCacheService(store).read({
          ...request,
          parser: "NativeText-1.0",
          parserConfigVersion: "page-native-v1",
        }),
      ).toEqual({ status: "missing" })
      expect(
        await new PageTranslationCacheService(store).read({
          ...request,
          parser: "PDF.js+PaddleOCR-VL-1.6",
          parserConfigVersion: "blocks-v2",
        }),
      ).toEqual({ status: "ready", blocks })
      expect(otherModel).toEqual({ status: "missing" })
      await new PageTranslationCacheService(store).clear(request)
      expect(await new PageTranslationCacheService(store).read(request)).toEqual({
        status: "missing",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("offers every earlier translation of a page, the current model's first, then the newest", async () => {
    const root = await mkdtemp(join(tmpdir(), "translation-cache-reuse-"))
    const store = new WorkspaceStore(root)
    const id = documentIdSchema.parse("aabbccddeeff0011")
    await store.save({
      ...defaultWorkspace(),
      documents: [
        documentRecordSchema.parse({
          id,
          name: "paper.pdf",
          hash: "c".repeat(64),
          bytes: 100,
          importedAt: "2026-09-03T00:00:00.000Z",
          pageCount: 2,
          title: "Paper",
          authors: [],
          year: null,
          doi: null,
          kind: "research_paper",
          overview: "",
          quality: { textCharacters: 100, needsOcr: false, warnings: [] },
        }),
      ],
    })
    const service = new PageTranslationCacheService(store)
    const page = {
      id,
      pageNumber: 1,
      targetLanguage: "ko" as const,
      provider: "anthropic" as const,
      parser: "PDF.js+PaddleOCR-VL-1.6" as const,
      parserConfigVersion: "hybrid-v12",
    }
    const block = (translation: string) => ({
      id: "page:1:block:0:sentence:1",
      kind: "body" as const,
      source: "Hello.",
      translation,
    })
    /** Dates each model's cached page, so which is newer does not hang on the clock. */
    async function date(model: string, seconds: number): Promise<void> {
      const base = join(root, "page-translations", "c".repeat(64))
      for (const directory of await readdir(base)) {
        const file = join(base, directory, "page-1.json")
        if (JSON.parse(await readFile(file, "utf8")).model === model)
          await utimes(file, seconds, seconds)
      }
    }

    try {
      await service.write({ ...page, model: "claude-sonnet-5", blocks: [block("오래된 번역")] })
      await service.write({ ...page, model: "claude-sonnet-5-5", blocks: [block("최근 번역")] })
      await service.write({ ...page, model: "claude-haiku-5-5", blocks: [block("하이쿠 번역")] })
      await date("claude-sonnet-5", 1_000)
      await date("claude-sonnet-5-5", 2_000)
      await date("claude-haiku-5-5", 500)
      const earlier = (model: string) =>
        service.read({ id, pageNumber: 1, targetLanguage: "ko", provider: "anthropic", model })

      // A model with nothing of its own gets every translation, the newest first.
      const other = await earlier("claude-opus-5-5")
      expect(other.status === "ready" && other.blocks.map((item) => item.translation)).toEqual([
        "최근 번역",
        "오래된 번역",
        "하이쿠 번역",
      ])
      // The current model's own translation comes first, however old.
      const own = await earlier("claude-haiku-5-5")
      expect(own.status === "ready" && own.blocks[0]?.translation).toBe("하이쿠 번역")
      // An exact read still answers only for the model that wrote it.
      expect(await service.read({ ...page, model: "claude-opus-5-5" })).toEqual({
        status: "missing",
      })

      // Translating a page again clears every model's translation of it, so none comes back.
      await service.clear({
        id,
        pageNumber: 1,
        targetLanguage: "ko",
        provider: "anthropic",
        model: "claude-haiku-5-5",
      })
      expect(await earlier("claude-haiku-5-5")).toEqual({ status: "missing" })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
