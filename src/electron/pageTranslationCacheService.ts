import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
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
import { replaceFile } from "./fileReplace"
import type { WorkspaceStore } from "./workspaceStore"

const cacheParserSchema = parsedPageParserSchema.or(z.literal("unknown"))
const cacheEntrySchema = pageTranslationCacheWriteRequestSchema.omit({ id: true }).extend({
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  parser: cacheParserSchema,
  parserConfigVersion: z.string().trim().min(1).max(64),
  translationRulesVersion: z.literal("page-translation-v14"),
})

/** A cached page file of one configuration and when it was last written (0 when absent). */
type Candidate = { readonly sourceHash: string; readonly file: string; readonly modified: number }

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
    candidates: readonly Candidate[],
  ): Promise<PageTranslationCacheResult> {
    const entries = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const entry = cacheEntrySchema.parse(JSON.parse(await readFile(candidate.file, "utf8")))
          if (
            entry.sourceHash !== candidate.sourceHash ||
            entry.pageNumber !== request.pageNumber ||
            entry.targetLanguage !== request.targetLanguage
          )
            return []
          return [{ entry, modified: candidate.modified }]
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
    const resolved = await this.#exactCandidate(request)
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
      translationRulesVersion: "page-translation-v14",
    })
    await mkdir(dirname(resolved.file), { recursive: true })
    const temporaryFile = `${resolved.file}.${randomUUID()}.tmp`
    await writeFile(temporaryFile, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 })
    await replaceFile(temporaryFile, resolved.file)
  }

  async clear(request: PageTranslationCacheReadRequest): Promise<void> {
    for (const candidate of await this.#resolveCandidates(request)) {
      try {
        const parsed = cacheEntrySchema.safeParse(
          JSON.parse(await readFile(candidate.file, "utf8")),
        )
        if (parsed.success && parsed.data.translationRulesVersion === "page-translation-v14")
          await rm(candidate.file, { force: true })
      } catch (error) {
        if (isMissingFile(error) || error instanceof SyntaxError) continue
        throw error
      }
    }
  }

  /** Where this exact configuration keeps the page; null when the document is gone. */
  async #exactCandidate(
    request: PageTranslationCacheReadRequest,
  ): Promise<{ readonly sourceHash: string; readonly file: string } | null> {
    const document = await this.store.findDocument(request.id)
    if (!document) return null
    const configuration = [
      request.targetLanguage,
      request.provider,
      request.model,
      request.parser ?? "unknown",
      request.parserConfigVersion ?? "unknown",
      "page-translation-v14",
    ].join("\0")
    const configurationHash = createHash("sha256").update(configuration).digest("hex")
    const base = join(this.store.root, "page-translations", document.hash)
    return {
      sourceHash: document.hash,
      file: join(base, configurationHash, `page-${request.pageNumber}.json`),
    }
  }

  /**
   * The exact configuration's page and, without parser options, the page under every other
   * configuration of the paper: one listing and one parallel round of stats.
   */
  async #resolveCandidates(
    request: PageTranslationCacheReadRequest,
  ): Promise<readonly Candidate[]> {
    const exact = await this.#exactCandidate(request)
    if (!exact) return []
    if (request.parser || request.parserConfigVersion) return [{ ...exact, modified: 0 }]
    const base = dirname(dirname(exact.file))
    const files = [exact.file]
    try {
      for (const entry of await readdir(base, { withFileTypes: true })) {
        const file = join(base, entry.name, `page-${request.pageNumber}.json`)
        if (entry.isDirectory() && file !== exact.file) files.push(file)
      }
    } catch (error) {
      if (!isMissingFile(error)) throw error
    }
    const [own, ...others] = await Promise.all(
      files.map(async (file) => ({
        sourceHash: exact.sourceHash,
        file,
        modified: await stat(file).then(
          (info) => info.mtimeMs,
          () => 0,
        ),
      })),
    )
    // The latest translation first: it was cut by the parser closest to the current one.
    others.sort((left, right) => right.modified - left.modified)
    return own ? [own, ...others] : others
  }
}
