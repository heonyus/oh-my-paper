import type { SourceDocumentAst } from "../../shared/documentAst"
import type { DocumentId } from "../../shared/schemas"
import { documentLayoutPage } from "./documentLayoutRuntime"
import { type LocalPageTranslationBlock, localPageTranslationBlocks } from "./pageTranslationLayout"

const astByDocument = new Map<DocumentId, SourceDocumentAst>()
const astWaiters = new Map<DocumentId, Set<(ast: SourceDocumentAst) => void>>()
let activeDocumentId: DocumentId | null = null

export function setActiveDocumentAst(documentId: DocumentId, ast: SourceDocumentAst): void {
  astByDocument.set(documentId, ast)
  activeDocumentId = documentId
  const waiters = astWaiters.get(documentId)
  astWaiters.delete(documentId)
  for (const resolve of waiters ?? []) resolve(ast)
}

/** Resolves once the reader has loaded this document's AST, or null after the timeout. */
export function waitForDocumentAst(
  documentId: DocumentId,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<SourceDocumentAst | null> {
  const loaded = astByDocument.get(documentId)
  if (loaded || signal?.aborted) return Promise.resolve(loaded ?? null)
  return new Promise((resolve) => {
    const waiters = astWaiters.get(documentId) ?? new Set()
    astWaiters.set(documentId, waiters)
    const finish = (ast: SourceDocumentAst | null): void => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      waiters.delete(settle)
      resolve(ast)
    }
    const settle = (ast: SourceDocumentAst): void => finish(ast)
    const abort = (): void => finish(null)
    const timer = setTimeout(() => finish(null), timeoutMs)
    waiters.add(settle)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

export function activeDocumentAst(documentId?: DocumentId): SourceDocumentAst | null {
  const id = documentId ?? activeDocumentId
  return id ? (astByDocument.get(id) ?? null) : null
}

export function clearActiveDocumentAst(documentId: DocumentId): void {
  astByDocument.delete(documentId)
  if (activeDocumentId === documentId) activeDocumentId = null
}

function pageSpans(pageNumber: number): readonly HTMLSpanElement[] {
  const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
  return page ? [...page.querySelectorAll<HTMLSpanElement>(".textLayer span")] : []
}

export function bindPageTranslationBlocks(
  pageNumber: number,
  blocks: readonly { readonly id: string; readonly sourceItemIds: readonly string[] }[],
): void {
  for (const span of pageSpans(pageNumber)) span.removeAttribute("data-page-translation-block")
  for (const block of blocks) {
    for (const span of pageSpans(pageNumber)) {
      const ids = span.getAttribute("data-ast-source-item-id")?.split(",") ?? []
      if (block.sourceItemIds.some((id) => ids.includes(id)))
        span.setAttribute("data-page-translation-block", block.id)
    }
  }
}

export function bindAstItemsToRenderedPage(documentId: DocumentId, pageNumber: number): void {
  const ast = activeDocumentAst(documentId)
  if (!ast) return
  const items = ast.items
    .filter((item) => item.pageId === `page:${pageNumber}`)
    .sort((left, right) => left.normalizedStart - right.normalizedStart)
  const claimed = new Set<string>()
  for (const [spanIndex, span] of pageSpans(pageNumber).entries()) {
    const text = span.textContent?.trim() ?? ""
    if (!text) continue
    const item = items.find(
      (candidate) => !claimed.has(candidate.id) && candidate.text.trim() === text,
    )
    if (!item) continue
    claimed.add(item.id)
    span.setAttribute("data-ast-source-item-id", item.id)
    span.setAttribute("data-ast-span-id", `span:page:${pageNumber}:${spanIndex}`)
  }
}

export function pageSourceBlocksForDocument(
  documentId: DocumentId,
  pageNumber: number,
): readonly LocalPageTranslationBlock[] | null {
  const ast = activeDocumentAst(documentId)
  if (!ast) return null
  const blocks = localPageTranslationBlocks(
    ast,
    pageNumber,
    documentLayoutPage(documentId, pageNumber),
  )
  if (blocks.length === 0) return null
  bindAstItemsToRenderedPage(documentId, pageNumber)
  bindPageTranslationBlocks(pageNumber, blocks)
  return blocks
}
