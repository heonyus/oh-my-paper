import type { ProviderStatus } from "../../shared/ipc"
import type { CachedPageTranslationBlock } from "../../shared/pageTranslationCache"
import type { DocumentId } from "../../shared/schemas"
import type { PageTranslationBlock } from "./pageTranslationSource"

const sessionCache = new Map<string, readonly PageTranslationBlock[]>()

export function pageTranslationCacheIdentity(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
): string {
  return `v6:${documentId}:${page}:ko:${provider.provider}:${provider.model}`
}

function request(documentId: DocumentId, page: number, provider: ProviderStatus) {
  return {
    id: documentId,
    pageNumber: page,
    targetLanguage: "ko" as const,
    provider: provider.provider,
    model: provider.model,
  }
}

function runtimeBlocks(
  blocks: readonly CachedPageTranslationBlock[],
): readonly PageTranslationBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    kind: block.kind,
    source: block.source,
    translation: block.translation,
    ...(block.parsedBlockId === undefined ? {} : { parsedBlockId: block.parsedBlockId }),
    ...(block.sourceBounds === undefined ? {} : { sourceBounds: block.sourceBounds }),
    ...(block.sourcePageWidth === undefined ? {} : { sourcePageWidth: block.sourcePageWidth }),
    ...(block.sourcePageHeight === undefined ? {} : { sourcePageHeight: block.sourcePageHeight }),
  }))
}

export async function readCachedPageTranslation(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
): Promise<readonly PageTranslationBlock[] | null> {
  const cached = sessionCache.get(pageTranslationCacheIdentity(documentId, page, provider))
  if (cached) return cached
  try {
    const stored = await window.scourgify.readPageTranslationCache(
      request(documentId, page, provider),
    )
    if (stored.status !== "ready") return null
    const blocks = runtimeBlocks(stored.blocks)
    sessionCache.set(pageTranslationCacheIdentity(documentId, page, provider), blocks)
    return blocks
  } catch (error) {
    if (error instanceof Error) return null
    throw error
  }
}

export async function storeCachedPageTranslation(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
  blocks: readonly PageTranslationBlock[],
): Promise<void> {
  if (blocks.length === 0 || blocks.some((block) => !block.translation.trim())) return
  sessionCache.set(pageTranslationCacheIdentity(documentId, page, provider), blocks)
  try {
    await window.scourgify.writePageTranslationCache({
      ...request(documentId, page, provider),
      blocks,
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}

export async function clearCachedPageTranslation(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
): Promise<void> {
  sessionCache.delete(pageTranslationCacheIdentity(documentId, page, provider))
  try {
    await window.scourgify.clearPageTranslationCache(request(documentId, page, provider))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}
