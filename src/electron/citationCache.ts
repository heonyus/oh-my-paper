import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import type { CitationLookupRequest, CitationLookupResult } from "../shared/ipc"
import { citationLookupRequestSchema, citationLookupResultSchema } from "../shared/ipc"
import { lookupCitation, type Transport } from "./citationService"
import { replaceFile } from "./fileReplace"

const negativeCacheLifetimeMs = 6 * 60 * 60 * 1_000
const cacheRecordSchema = z.object({
  version: z.literal(1),
  savedAt: z.string().datetime(),
  result: citationLookupResultSchema,
})

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export class CitationLookupCache {
  readonly #active = new Map<string, Promise<CitationLookupResult>>()

  constructor(
    readonly root: string,
    readonly transport?: Transport,
    readonly now: () => Date = () => new Date(),
  ) {}

  lookup(input: CitationLookupRequest): Promise<CitationLookupResult> {
    const request = citationLookupRequestSchema.parse(input)
    const key = createHash("sha256").update(JSON.stringify(request)).digest("hex")
    const active = this.#active.get(key)
    if (active) return active
    const operation = this.#lookup(key, request).finally(() => this.#active.delete(key))
    this.#active.set(key, operation)
    return operation
  }

  async #lookup(key: string, request: CitationLookupRequest): Promise<CitationLookupResult> {
    const directory = join(this.root, "citations")
    const path = join(directory, `${key}.json`)
    try {
      const cached = cacheRecordSchema.parse(JSON.parse(await readFile(path, "utf8")))
      const age = this.now().getTime() - new Date(cached.savedAt).getTime()
      if (cached.result.status === "found" || age < negativeCacheLifetimeMs) return cached.result
    } catch (error) {
      if (
        !isMissingFile(error) &&
        !(error instanceof SyntaxError) &&
        !(error instanceof z.ZodError)
      ) {
        throw error
      }
    }
    const result = await lookupCitation(request, this.transport)
    const temporaryPath = `${path}.tmp`
    await mkdir(directory, { recursive: true })
    await writeFile(
      temporaryPath,
      JSON.stringify({ version: 1, savedAt: this.now().toISOString(), result }),
      { encoding: "utf8", mode: 0o600 },
    )
    await replaceFile(temporaryPath, path)
    return result
  }
}
