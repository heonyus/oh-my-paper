import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { DocumentAnalysisService } from "../electron/documentAnalysisService"
import type { PaddlePageParserService } from "../electron/paddlePageParserService"
import type { WorkspaceStore } from "../electron/workspaceStore"
import { type DocumentId, sha256Schema } from "../shared/schemas"

type DocumentDeletionServices = {
  readonly store: WorkspaceStore
  readonly analysis: Pick<DocumentAnalysisService, "forget">
  readonly paddle: Pick<PaddlePageParserService, "forget">
}

/** Caches derived only from one PDF's bytes, keyed by its content hash. */
const HASH_CACHE_DIRECTORIES = ["parsed-pages", "document-ast", "page-translations"] as const

/**
 * Deletes a library document: stops its analysis, removes its records, then its stored
 * PDF and caches once no other record uses the same content. Returns false when absent.
 */
export async function deleteLibraryDocument(
  services: DocumentDeletionServices,
  id: DocumentId,
): Promise<boolean> {
  const document = await services.store.findDocument(id)
  if (!document) return false
  await services.analysis.forget(id)
  services.paddle.forget(document.hash)
  const removed = await services.store.deleteDocument(id)
  if (!removed) return false
  if (services.store.repository.findDocumentVersionsByHash(removed.hash).length > 0) return true
  const hash = sha256Schema.parse(removed.hash)
  await Promise.all([
    rm(join(services.store.documentsDirectory, `${hash}.pdf`), { force: true }),
    // Windows refuses to remove a folder while the OCR worker is still writing a page into it.
    ...HASH_CACHE_DIRECTORIES.map((directory) =>
      rm(join(services.store.root, directory, hash), {
        recursive: true,
        force: true,
        maxRetries: 5,
      }),
    ),
  ])
  return true
}
