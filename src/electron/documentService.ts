import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { PDFDocument } from "pdf-lib"
import type { ImportResult } from "../shared/ipc"
import type { DocumentId, DocumentRecord } from "../shared/schemas"
import { documentRecordSchema } from "../shared/schemas"
import type { WorkspaceStore } from "./workspaceStore"

export class DocumentImportError extends Error {
  readonly name = "DocumentImportError"

  constructor(
    readonly kind: "invalid_pdf" | "password_required" | "read_failed",
    cause?: unknown,
  ) {
    super(kind, { cause })
  }
}

function extractDoi(subject: string | undefined): string | null {
  return subject?.match(/10\.\d{4,9}\/[\w.()/:;-]+/iu)?.[0] ?? null
}

function extractAuthors(author: string | undefined): readonly string[] {
  return (
    author
      ?.split(/[;,]/u)
      .map((value) => value.trim())
      .filter((value) => value.length > 0) ?? []
  )
}

async function inspectDocument(bytes: Uint8Array, sourcePath: string): Promise<DocumentRecord> {
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new DocumentImportError("invalid_pdf")
  }
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    const hash = createHash("sha256").update(bytes).digest("hex")
    return documentRecordSchema.parse({
      id: hash.slice(0, 16),
      name: basename(sourcePath),
      hash,
      bytes: bytes.length,
      importedAt: new Date().toISOString(),
      pageCount: pdf.getPageCount(),
      title: pdf.getTitle()?.trim() || basename(sourcePath).replace(/\.pdf$/iu, ""),
      authors: extractAuthors(pdf.getAuthor()),
      year: pdf.getCreationDate()?.getFullYear() ?? null,
      doi: extractDoi(pdf.getSubject()),
      quality: { textCharacters: 0, needsOcr: false, warnings: [] },
    })
  } catch (error) {
    if (error instanceof DocumentImportError) throw error
    if (error instanceof Error && /encrypt|password/iu.test(error.message)) {
      throw new DocumentImportError("password_required")
    }
    throw new DocumentImportError("read_failed", error)
  }
}

export async function importDocument(
  sourcePath: string,
  store: WorkspaceStore,
): Promise<ImportResult> {
  const bytes = await readFile(sourcePath)
  const document = await inspectDocument(bytes, sourcePath)
  const workspace = await store.read()
  const existing = workspace.documents.find((candidate) => candidate.hash === document.hash)
  if (existing) return { document: existing, duplicate: true }

  await mkdir(store.documentsDirectory, { recursive: true })
  await copyFile(sourcePath, join(store.documentsDirectory, `${document.hash}.pdf`))
  await store.save({
    ...workspace,
    documents: [...workspace.documents, document],
    activeDocumentId: document.id,
  })
  return { document, duplicate: false }
}

export async function readDocumentBytes(id: DocumentId, store: WorkspaceStore): Promise<Buffer> {
  return readFile(await resolveDocumentPath(id, store))
}

export async function resolveDocumentPath(id: DocumentId, store: WorkspaceStore): Promise<string> {
  const workspace = await store.read()
  const document = workspace.documents.find((candidate) => candidate.id === id)
  if (!document) throw new DocumentImportError("read_failed")
  return join(store.documentsDirectory, `${document.hash}.pdf`)
}
