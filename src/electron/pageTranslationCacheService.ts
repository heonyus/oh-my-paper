import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { z } from "zod"
import { parsedPageParserSchema } from "../shared/documentPageModel"
import {
  type PageTranslationCacheReadRequest,
  type PageTranslationCacheResult,
  type PageTranslationCacheWriteRequest,
  pageTranslationCacheResultSchema,
  pageTranslationCacheWriteRequestSchema,
} from "../shared/pageTranslationCache"
import type { WorkspaceStore } from "./workspaceStore"

const cacheParserSchema = parsedPageParserSchema.or(z.literal("unknown"))
const cacheEntrySchema = pageTranslationCacheWriteRequestSchema.omit({ id: true }).extend({
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  parser: cacheParserSchema,
  parserConfigVersion: z.string().trim().min(1).max(64),
  translationRulesVersion: z.literal("page-translation-v10"),
})

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class PageTranslationCacheService {
  constructor(readonly store: WorkspaceStore) {}

  async read(request: PageTranslationCacheReadRequest): Promise<PageTranslationCacheResult> {
    const resolved = await this.#resolveCandidates(request)
    for (const candidate of resolved) {
      try {
        const entry = cacheEntrySchema.parse(JSON.parse(await readFile(candidate.file, "utf8")))
        if (entry.sourceHash !== candidate.sourceHash) continue
        if (entry.pageNumber !== request.pageNumber) continue
        if (entry.targetLanguage !== request.targetLanguage) continue
        if (entry.provider !== request.provider || entry.model !== request.model) continue
        if (request.parser && entry.parser !== request.parser) continue
        if (
          request.parserConfigVersion &&
          entry.parserConfigVersion !== request.parserConfigVersion
        )
          continue
        return pageTranslationCacheResultSchema.parse({ status: "ready", blocks: entry.blocks })
      } catch (error) {
        if (isMissingFile(error)) continue
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
          continue
        }
        throw error
      }
    }
    return { status: "missing" }
  }

  async write(request: PageTranslationCacheWriteRequest): Promise<void> {
    const resolved = (await this.#resolveCandidates(request))[0]
    if (!resolved) return
    const entry = cacheEntrySchema.parse({
      pageNumber: request.pageNumber,
      targetLanguage: request.targetLanguage,
      provider: request.provider,
      model: request.model,
      blocks: request.blocks,
      sourceHash: resolved.sourceHash,
      parser: request.parser ?? "unknown",
      parserConfigVersion: request.parserConfigVersion ?? "unknown",
      translationRulesVersion: "page-translation-v10",
    })
    await mkdir(dirname(resolved.file), { recursive: true })
    const temporaryFile = `${resolved.file}.${randomUUID()}.tmp`
    await writeFile(temporaryFile, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 })
    await rename(temporaryFile, resolved.file)
  }

  async clear(request: PageTranslationCacheReadRequest): Promise<void> {
    for (const candidate of await this.#resolveCandidates(request)) {
      try {
        const parsed = cacheEntrySchema.safeParse(
          JSON.parse(await readFile(candidate.file, "utf8")),
        )
        if (parsed.success && parsed.data.translationRulesVersion === "page-translation-v10")
          await rm(candidate.file, { force: true })
      } catch (error) {
        if (isMissingFile(error) || error instanceof SyntaxError) continue
        throw error
      }
    }
  }

  async #resolveCandidates(request: PageTranslationCacheReadRequest) {
    const workspace = await this.store.read()
    const document = workspace.documents.find((candidate) => candidate.id === request.id)
    if (!document) return []
    const base = join(this.store.root, "page-translations", document.hash)
    const configuration = [
      request.targetLanguage,
      request.provider,
      request.model,
      request.parser ?? "unknown",
      request.parserConfigVersion ?? "unknown",
      "page-translation-v10",
    ].join("\0")
    const configurationHash = createHash("sha256").update(configuration).digest("hex")
    const exact = {
      sourceHash: document.hash,
      file: join(base, configurationHash, `page-${request.pageNumber}.json`),
    }
    if (request.parser || request.parserConfigVersion) return [exact]
    try {
      const directories = await readdir(base, { withFileTypes: true })
      return [
        exact,
        ...directories
          .filter((entry) => entry.isDirectory() && entry.name !== configurationHash)
          .map((entry) => ({
            sourceHash: document.hash,
            file: join(base, entry.name, `page-${request.pageNumber}.json`),
          })),
      ]
    } catch (error) {
      if (isMissingFile(error)) return [exact]
      throw error
    }
  }
}
