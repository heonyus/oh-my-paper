import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type DocumentId, documentIdSchema } from "../shared/schemas"
import { replaceFile } from "./fileReplace"

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

  constructor(readonly root: string) {
    this.#file = join(root, "document-analysis-queue.json")
  }

  async load(): Promise<DocumentAnalysisState> {
    try {
      const parsed = storedStateSchema.parse(JSON.parse(await readFile(this.#file, "utf8")))
      return parsed.version === 1
        ? { pendingIds: parsed.documentIds, readyIds: [] }
        : { pendingIds: parsed.pendingIds, readyIds: parsed.readyIds }
    } catch (error) {
      if (missingFile(error) || error instanceof SyntaxError || error instanceof z.ZodError)
        return { pendingIds: [], readyIds: [] }
      throw error
    }
  }

  async save(state: DocumentAnalysisState): Promise<void> {
    const parsed = storedStateSchema.parse({ version: 2, ...state })
    const operation = this.#writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.root, { recursive: true })
        const temporaryFile = `${this.#file}.${randomUUID()}.tmp`
        await writeFile(temporaryFile, JSON.stringify(parsed), { encoding: "utf8", mode: 0o600 })
        await replaceFile(temporaryFile, this.#file)
      })
    this.#writeQueue = operation
    await operation
  }
}
