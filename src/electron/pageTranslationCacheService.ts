import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
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
  translationRulesVersion: z.literal("page-translation-v13"),
})

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class PageTranslationCacheService {
  constructor(readonly store: WorkspaceStore) {}

  async read(request: PageTranslationCacheReadRequest): Promise<PageTranslationCacheResult> {
    const resolved = await this.#resolveCandidates(request)
    if (!request.parser && !request.parserConfigVersion) return this.#readEarlier(request, resolved)
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

  /**
   * Every earlier translation of the page, whichever parser cut it and whichever model wrote
   * it, so a change of parser or of model keeps what was already translated: the current
   * model's first, then the most recent. The caller matches each unit by its source text.
   */
  async #readEarlier(
    request: PageTranslationCacheReadRequest,
    candidates: readonly { readonly sourceHash: string; readonly file: string }[],
  ): Promise<PageTranslationCacheResult> {
    const entries = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const [text, info] = await Promise.all([
            readFile(candidate.file, "utf8"),
            stat(candidate.file),
          ])
          const entry = cacheEntrySchema.parse(JSON.parse(text))
          if (
            entry.sourceHash !== candidate.sourceHash ||
            entry.pageNumber !== request.pageNumber ||
            entry.targetLanguage !== request.targetLanguage
          )
            return []
          return [{ entry, modified: info.mtimeMs }]
        } catch (error) {
          if (isMissingFile(error) || error instanceof SyntaxError || error instanceof z.ZodError)
            return []
          throw error
        }
      }),
    )
    const own = (entry: z.infer<typeof cacheEntrySchema>): number =>
      Number(entry.provider === request.provider && entry.model === request.model)
    const blocks = entries
      .flat()
      .sort((left, right) => own(right.entry) - own(left.entry) || right.modified - left.modified)
      .flatMap(({ entry }) => entry.blocks)
      .slice(0, 2_048)
    if (blocks.length === 0) return { status: "missing" }
    return pageTranslationCacheResultSchema.parse({ status: "ready", blocks })
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
      translationRulesVersion: "page-translation-v13",
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
        if (parsed.success && parsed.data.translationRulesVersion === "page-translation-v13")
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
      "page-translation-v13",
    ].join("\0")
    const configurationHash = createHash("sha256").update(configuration).digest("hex")
    const exact = {
      sourceHash: document.hash,
      file: join(base, configurationHash, `page-${request.pageNumber}.json`),
    }
    if (request.parser || request.parserConfigVersion) return [exact]
    try {
      const directories = await readdir(base, { withFileTypes: true })
      const others = await Promise.all(
        directories
          .filter((entry) => entry.isDirectory() && entry.name !== configurationHash)
          .map(async (entry) => {
            const file = join(base, entry.name, `page-${request.pageNumber}.json`)
            const modified = await stat(file).then(
              (info) => info.mtimeMs,
              () => 0,
            )
            return { sourceHash: document.hash, file, modified }
          }),
      )
      // The latest translation first: it was cut by the parser closest to the current one.
      others.sort((left, right) => right.modified - left.modified)
      return [exact, ...others.map(({ sourceHash, file }) => ({ sourceHash, file }))]
    } catch (error) {
      if (isMissingFile(error)) return [exact]
      throw error
    }
  }
}
