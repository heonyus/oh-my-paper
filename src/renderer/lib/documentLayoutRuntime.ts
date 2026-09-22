import type { DocumentLayoutPage } from "../../shared/documentLayout"
import type { DocumentId } from "../../shared/schemas"

const layoutPagesByDocument = new Map<DocumentId, ReadonlyMap<number, DocumentLayoutPage>>()

export async function loadDocumentLayoutPages(
  documentId: DocumentId,
): Promise<ReadonlyMap<number, DocumentLayoutPage> | null> {
  const result = await window.ohmypaper.readDocumentLayout(documentId)
  if (result.status !== "ready") return null
  const pages = new Map(result.layout.pages.map((page) => [page.pageNumber, page] as const))
  layoutPagesByDocument.set(documentId, pages)
  return pages
}

export function documentLayoutPage(
  documentId: DocumentId,
  pageNumber: number,
): DocumentLayoutPage | null {
  return layoutPagesByDocument.get(documentId)?.get(pageNumber) ?? null
}

export function clearDocumentLayoutPages(documentId: DocumentId): void {
  layoutPagesByDocument.delete(documentId)
}
