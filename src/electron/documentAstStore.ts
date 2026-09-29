import { createHash, randomUUID } from "node:crypto"
import type { FileHandle } from "node:fs/promises"
import { mkdir, open, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type SourceDocumentAst, sourceDocumentAstSchema } from "../shared/documentAst"
import { astFingerprintSchema } from "../shared/documentAstIpc"
import { sha256Schema } from "../shared/schemas"
import { replaceFile } from "./fileReplace"

const sidecarSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  fingerprint: astFingerprintSchema,
  source: sourceDocumentAstSchema,
})

export type AstFingerprintInput = {
  readonly sourceHash: string
  readonly extractorVersion: string
  readonly configVersion: string
}

export type DocumentAstStoreOptions = {
  readonly beforeRename?: () => Promise<void>
}

export class DocumentAstStoreError extends Error {
  readonly name = "DocumentAstStoreError"

  constructor(
    readonly kind: "write_failed",
    cause?: unknown,
  ) {
    super(kind)
    if (cause instanceof Error) this.message = `${kind}: ${cause.message}`
  }
}

export function createAstFingerprint(input: AstFingerprintInput): string {
  const sourceHash = sha256Schema.parse(input.sourceHash)
  const identity = [
    "document-ast",
    "1.0.0",
    sourceHash,
    input.extractorVersion,
    input.configVersion,
  ].join("|")
  return createHash("sha256").update(identity).digest("hex")
}

export function astSidecarPath(root: string, sourceHash: string, fingerprint: string): string {
  const hash = sha256Schema.parse(sourceHash)
  const identity = astFingerprintSchema.parse(fingerprint)
  return join(root, "document-ast", hash, `${identity}.json`)
}

export class DocumentAstStore {
  readonly #options: DocumentAstStoreOptions

  constructor(
    readonly root: string,
    options: DocumentAstStoreOptions = {},
  ) {
    this.#options = options
  }

  async read(sourceHash: string, fingerprint: string): Promise<SourceDocumentAst | null> {
    const path = astSidecarPath(this.root, sourceHash, fingerprint)
    try {
      const value = sidecarSchema.parse(JSON.parse(await readFile(path, "utf8")))
      if (value.fingerprint !== fingerprint || value.source.sourceHash !== sourceHash) return null
      return value.source
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
      if (error instanceof z.ZodError || error instanceof SyntaxError) return null
      throw error
    }
  }

  async write(source: SourceDocumentAst, fingerprint: string): Promise<void> {
    const parsedSource = sourceDocumentAstSchema.parse(source)
    const identity = astFingerprintSchema.parse(fingerprint)
    const path = astSidecarPath(this.root, parsedSource.sourceHash, identity)
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    let handle: FileHandle | undefined
    try {
      await mkdir(join(this.root, "document-ast", parsedSource.sourceHash), { recursive: true })
      handle = await open(temporaryPath, "wx", 0o600)
      const value = JSON.stringify({
        schemaVersion: "1.0.0",
        fingerprint: identity,
        source: parsedSource,
      })
      await handle.writeFile(value, "utf8")
      await handle.sync()
      await handle.close()
      handle = undefined
      await this.#options.beforeRename?.()
      await replaceFile(temporaryPath, path)
    } catch (error) {
      if (handle) await handle.close()
      await rm(temporaryPath, { force: true })
      if (error instanceof Error) throw new DocumentAstStoreError("write_failed", error)
      throw error
    }
  }
}
