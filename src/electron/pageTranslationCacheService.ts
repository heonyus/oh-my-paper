import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { z } from "zod"
import {
  type PageTranslationCacheReadRequest,
  type PageTranslationCacheResult,
  type PageTranslationCacheWriteRequest,
  pageTranslationCacheResultSchema,
  pageTranslationCacheWriteRequestSchema,
} from "../shared/pageTranslationCache"
import type { WorkspaceStore } from "./workspaceStore"

const cacheEntrySchema = pageTranslationCacheWriteRequestSchema.omit({ id: true }).extend({
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  parser: z.literal("PaddleOCR-VL-1.6"),
  parserConfigVersion: z.literal("page-v1"),
  translationRulesVersion: z.literal("page-translation-v6"),
})

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class PageTranslationCacheService {
  constructor(readonly store: WorkspaceStore) {}

  async read(request: PageTranslationCacheReadRequest): Promise<PageTranslationCacheResult> {
    const resolved = await this.#resolve(request)
    if (!resolved) return { status: "missing" }
    try {
      const entry = cacheEntrySchema.parse(JSON.parse(await readFile(resolved.file, "utf8")))
      if (entry.sourceHash !== resolved.sourceHash) return { status: "missing" }
      return pageTranslationCacheResultSchema.parse({ status: "ready", blocks: entry.blocks })
    } catch (error) {
      if (isMissingFile(error)) return { status: "missing" }
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        await rm(resolved.file, { force: true })
        return { status: "missing" }
      }
      throw error
    }
  }

  async write(request: PageTranslationCacheWriteRequest): Promise<void> {
    const resolved = await this.#resolve(request)
    if (!resolved) return
    const entry = cacheEntrySchema.parse({
      pageNumber: request.pageNumber,
      targetLanguage: request.targetLanguage,
      provider: request.provider,
      model: request.model,
      blocks: request.blocks,
      sourceHash: resolved.sourceHash,
      parser: "PaddleOCR-VL-1.6",
      parserConfigVersion: "page-v1",
      translationRulesVersion: "page-translation-v6",
    })
    await mkdir(dirname(resolved.file), { recursive: true })
    const temporaryFile = `${resolved.file}.${randomUUID()}.tmp`
    await writeFile(temporaryFile, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 })
    await rename(temporaryFile, resolved.file)
  }

  async clear(request: PageTranslationCacheReadRequest): Promise<void> {
    const resolved = await this.#resolve(request)
    if (resolved) await rm(resolved.file, { force: true })
  }

  async #resolve(request: PageTranslationCacheReadRequest) {
    const workspace = await this.store.read()
    const document = workspace.documents.find((candidate) => candidate.id === request.id)
    if (!document) return null
    const configuration = [
      request.targetLanguage,
      request.provider,
      request.model,
      "PaddleOCR-VL-1.6",
      "page-v1",
      "page-translation-v6",
    ].join("\0")
    const configurationHash = createHash("sha256").update(configuration).digest("hex")
    return {
      sourceHash: document.hash,
      file: join(
        this.store.root,
        "page-translations",
        document.hash,
        configurationHash,
        `page-${request.pageNumber}.json`,
      ),
    }
  }
}
