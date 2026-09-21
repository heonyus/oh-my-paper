// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises"
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
})
