import { createHash } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import type { SourceDocumentAst } from "../shared/documentAst"
import type { ImportResult } from "../shared/ipc"
import {
  type DocumentId,
  type DocumentRecord,
  documentRecordSchema,
  sha256Schema,
} from "../shared/schemas"
import { replaceDurably } from "./collectionJournal"
import { resolveCollectionPath } from "./collectionPaths"
import { createAstFingerprint, DocumentAstStore, DocumentAstStoreError } from "./documentAstStore"
import type { WorkspaceStore } from "./workspaceStore"

const sourceAstExtractorVersion = "pdfjs-6-source-1"
const sourceAstConfigVersion = "source-only-v1"

export class DocumentImportError extends Error {
  readonly name = "DocumentImportError"

  constructor(
    readonly kind: "invalid_pdf" | "password_required" | "read_failed",
    cause?: unknown,
  ) {
    super(kind, { cause })
  }
}

function preparationErrorKind(error: unknown): DocumentImportError["kind"] | null {
  if (!(error instanceof Error) || error.name !== "PdfPreparationError") return null
  if (error.message === "invalid_pdf") return "invalid_pdf"
  if (error.message === "password_required") return "password_required"
  return "read_failed"
}

type InspectedDocument = {
  readonly document: DocumentRecord
  readonly sourceAst: SourceDocumentAst
}

async function inspectDocument(
  bytes: Uint8Array,
  sourcePath: string,
  originalName = basename(sourcePath),
): Promise<InspectedDocument> {
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new DocumentImportError("invalid_pdf")
  }
  try {
    const { preparePdf } = await import("./preparePdf")
    const prepared = await preparePdf(new Uint8Array(bytes), originalName)
    const document = documentRecordSchema.parse({
      id: prepared.hash.slice(0, 16),
      name: basename(originalName),
      hash: prepared.hash,
      bytes: bytes.length,
      importedAt: new Date().toISOString(),
      pageCount: prepared.pageCount,
      title: prepared.title,
      authors: prepared.authors,
      year: prepared.year,
      doi: prepared.doi,
      kind: prepared.kind,
      overview: prepared.overview,
      quality: prepared.quality,
    })
    return { document, sourceAst: prepared.sourceAst }
  } catch (error) {
    if (error instanceof DocumentImportError) throw error
    const preparationKind = preparationErrorKind(error)
    if (preparationKind) throw new DocumentImportError(preparationKind, error)
    if (error instanceof Error && /encrypt|password/iu.test(error.message)) {
      throw new DocumentImportError("password_required")
    }
    throw new DocumentImportError("read_failed", error)
  }
}

export async function importDocument(
  sourcePath: string,
  store: WorkspaceStore,
  originalName = basename(sourcePath),
): Promise<ImportResult> {
  const bytes = await readFile(sourcePath)
  const inspected = await inspectDocument(bytes, sourcePath, originalName)
  const inspectedHash = hashBytes(bytes)
  if (inspectedHash !== inspected.document.hash) {
    throw new DocumentImportError("read_failed")
  }
  const originalPath = await resolveOriginalPath(store, inspected.document.hash)
  await ensureOriginal(originalPath, bytes, inspected.document.hash)
  const fingerprint = createAstFingerprint({
    sourceHash: inspected.document.hash,
    extractorVersion: sourceAstExtractorVersion,
    configVersion: sourceAstConfigVersion,
  })
  try {
    await new DocumentAstStore(store.root).write(inspected.sourceAst, fingerprint)
  } catch (error) {
    if (error instanceof DocumentAstStoreError) {
      throw new DocumentImportError("read_failed", error)
    }
    throw error
  }
  return await store.addDocument(inspected.document)
}

async function resolveOriginalPath(store: WorkspaceStore, hash: string): Promise<string> {
  await mkdir(store.root, { recursive: true })
  const relativePath = `${basename(store.documentsDirectory)}/${hash}.pdf`
  return (await resolveCollectionPath(store.root, relativePath)).path
}

async function ensureOriginal(path: string, bytes: Uint8Array, hash: string): Promise<void> {
  try {
    const existing = await readFile(path)
    if (hashBytes(existing) !== hash) throw new DocumentImportError("read_failed")
    return
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  await replaceDurably(path, bytes)
  const persisted = await readFile(path)
  if (hashBytes(persisted) !== hash) throw new DocumentImportError("read_failed")
}

function hashBytes(bytes: Uint8Array): string {
  return sha256Schema.parse(createHash("sha256").update(bytes).digest("hex"))
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export async function readDocumentBytes(id: DocumentId, store: WorkspaceStore): Promise<Buffer> {
  return readFile(await resolveDocumentPath(id, store))
}

export async function resolveDocumentPath(id: DocumentId, store: WorkspaceStore): Promise<string> {
  const document = await store.findDocument(id)
  if (!document) throw new DocumentImportError("read_failed")
  return join(store.documentsDirectory, `${document.hash}.pdf`)
}
