import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type DocumentId, documentIdSchema } from "../shared/schemas"
import { replaceFile } from "./fileReplace"

/**
 * Ids kept per list. Beyond it only the first ids are written; the documents left out are
 * analysed again after a restart, which their cached pages make cheap.
 */
export const MAX_PERSISTED_ANALYSIS_IDS = 100_000

const idsSchema = z.array(documentIdSchema).max(MAX_PERSISTED_ANALYSIS_IDS)
const storedStateSchema = z.discriminatedUnion("version", [
  z.object({ version: z.literal(1), documentIds: idsSchema }),
  z.object({ version: z.literal(2), pendingIds: idsSchema, readyIds: idsSchema }),
  z.object({
    version: z.literal(3),
    parserVersion: z.string().min(1).max(128),
    pendingIds: idsSchema,
    readyIds: idsSchema,
  }),
])

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export type DocumentAnalysisState = {
  readonly pendingIds: readonly DocumentId[]
  readonly readyIds: readonly DocumentId[]
}

export class DocumentAnalysisStateStore {
  readonly #file: string
  /** The newest state not written yet; the write in flight picks it up when it lands. */
  #latest: DocumentAnalysisState | null = null
  #flushing: Promise<void> | null = null

  /** `parserVersion` names the page parser documents are analysed with now. */
  constructor(
    readonly root: string,
    readonly parserVersion: string,
  ) {
    this.#file = join(root, "document-analysis-queue.json")
  }

  async load(): Promise<DocumentAnalysisState> {
    try {
      const parsed = storedStateSchema.parse(JSON.parse(await readFile(this.#file, "utf8")))
      if (parsed.version === 1) return { pendingIds: parsed.documentIds, readyIds: [] }
      // Documents an earlier parser analysed are analysed again.
      const current = parsed.version === 3 && parsed.parserVersion === this.parserVersion
      return { pendingIds: parsed.pendingIds, readyIds: current ? parsed.readyIds : [] }
    } catch (error) {
      if (missingFile(error) || error instanceof SyntaxError || error instanceof z.ZodError)
        return { pendingIds: [], readyIds: [] }
      throw error
    }
  }

  /**
   * Writes `state`, coalesced: one write runs at a time and states saved meanwhile collapse
   * into the newest. Resolves once a write holding this state or a newer one has landed.
   */
  save(state: DocumentAnalysisState): Promise<void> {
    this.#latest = state
    this.#flushing ??= this.#flush()
    return this.#flushing
  }

  async #flush(): Promise<void> {
    try {
      let failure: { readonly error: unknown } | null = null
      for (let state = this.#latest; state !== null; state = this.#latest) {
        this.#latest = null
        failure = await this.#write(state).then(
          () => null,
          (error: unknown) => ({ error }),
        )
      }
      if (failure) throw failure.error
    } finally {
      this.#flushing = null
    }
  }

  async #write(state: DocumentAnalysisState): Promise<void> {
    const parsed = storedStateSchema.parse({
      version: 3,
      parserVersion: this.parserVersion,
      pendingIds: state.pendingIds.slice(0, MAX_PERSISTED_ANALYSIS_IDS),
      readyIds: state.readyIds.slice(0, MAX_PERSISTED_ANALYSIS_IDS),
    })
    await mkdir(this.root, { recursive: true })
    const temporaryFile = `${this.#file}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryFile, JSON.stringify(parsed), { encoding: "utf8", mode: 0o600 })
      await replaceFile(temporaryFile, this.#file)
    } catch (error) {
      await rm(temporaryFile, { force: true }).catch(() => undefined)
      throw error
    }
  }
}
