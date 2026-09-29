import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type DocumentId, documentIdSchema } from "../shared/schemas"

const storedStateSchema = z.discriminatedUnion("version", [
  z.object({
    version: z.literal(1),
    documentIds: z.array(documentIdSchema).max(64),
  }),
  z.object({
    version: z.literal(2),
    pendingIds: z.array(documentIdSchema).max(64),
    readyIds: z.array(documentIdSchema).max(64),
  }),
  z.object({
    version: z.literal(3),
    parserVersion: z.string().min(1).max(128),
    pendingIds: z.array(documentIdSchema).max(64),
    readyIds: z.array(documentIdSchema).max(64),
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
  #writeQueue: Promise<void> = Promise.resolve()

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

  async save(state: DocumentAnalysisState): Promise<void> {
    const parsed = storedStateSchema.parse({
      version: 3,
      parserVersion: this.parserVersion,
      ...state,
    })
    const operation = this.#writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.root, { recursive: true })
        const temporaryFile = `${this.#file}.${randomUUID()}.tmp`
        await writeFile(temporaryFile, JSON.stringify(parsed), { encoding: "utf8", mode: 0o600 })
        await rename(temporaryFile, this.#file)
      })
    this.#writeQueue = operation
    await operation
  }
}
