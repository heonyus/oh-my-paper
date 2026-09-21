import type { ProviderStatus } from "../../shared/ipc"
import type { CachedPageTranslationBlock } from "../../shared/pageTranslationCache"
import type { DocumentId } from "../../shared/schemas"
import type { PageTranslationBlock } from "./pageTranslationSource"

const sessionCache = new Map<string, readonly PageTranslationBlock[]>()

export function pageTranslationCacheIdentity(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
  parser?: CachedPageTranslationBlock["sourceParser"],
  parserConfigVersion?: string,
): string {
  return `v9:${documentId}:${page}:ko:${provider.provider}:${provider.model}:${parser ?? "unknown"}:${parserConfigVersion ?? "unknown"}`
}

function pageTranslationCachePrefix(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
): string {
  return `v9:${documentId}:${page}:ko:${provider.provider}:${provider.model}:`
}

function request(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
  parser?: "PDF.js+PaddleOCR-VL-1.6" | "PaddleOCR-VL-1.6" | "NativeText-1.0",
  parserConfigVersion?: string,
) {
  return {
    id: documentId,
    pageNumber: page,
    targetLanguage: "ko" as const,
    provider: provider.provider,
    model: provider.model,
    ...(parser === undefined ? {} : { parser }),
    ...(parserConfigVersion === undefined ? {} : { parserConfigVersion }),
  }
}

function runtimeBlocks(
  blocks: readonly CachedPageTranslationBlock[],
): readonly PageTranslationBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    kind: block.kind,
    ...(block.structureKind === undefined ? {} : { structureKind: block.structureKind }),
    source: block.source,
    translation: block.translation,
    ...(block.parsedBlockId === undefined ? {} : { parsedBlockId: block.parsedBlockId }),
    ...(block.sourceBounds === undefined ? {} : { sourceBounds: block.sourceBounds }),
    ...(block.sourcePageWidth === undefined ? {} : { sourcePageWidth: block.sourcePageWidth }),
    ...(block.sourcePageHeight === undefined ? {} : { sourcePageHeight: block.sourcePageHeight }),
    ...(block.sourceParser === undefined ? {} : { sourceParser: block.sourceParser }),
    ...(block.sourceParserConfigVersion === undefined
      ? {}
      : { sourceParserConfigVersion: block.sourceParserConfigVersion }),
  }))
}

export async function readCachedPageTranslation(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
  parser?: CachedPageTranslationBlock["sourceParser"],
  parserConfigVersion?: string,
): Promise<readonly PageTranslationBlock[] | null> {
  const cached = sessionCache.get(
    pageTranslationCacheIdentity(documentId, page, provider, parser, parserConfigVersion),
  )
  if (cached) return cached
  try {
    const stored = await window.scourgify.readPageTranslationCache(
      request(documentId, page, provider, parser, parserConfigVersion),
    )
    if (stored.status !== "ready") return null
    const blocks = runtimeBlocks(stored.blocks)
    sessionCache.set(
      pageTranslationCacheIdentity(documentId, page, provider, parser, parserConfigVersion),
      blocks,
    )
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
  const firstBlock = blocks[0]
  sessionCache.set(
    pageTranslationCacheIdentity(
      documentId,
      page,
      provider,
      firstBlock?.sourceParser,
      firstBlock?.sourceParserConfigVersion,
    ),
    blocks,
  )
  try {
    await window.scourgify.writePageTranslationCache({
      ...request(
        documentId,
        page,
        provider,
        firstBlock?.sourceParser,
        firstBlock?.sourceParserConfigVersion,
      ),
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
  const prefix = pageTranslationCachePrefix(documentId, page, provider)
  for (const key of sessionCache.keys()) if (key.startsWith(prefix)) sessionCache.delete(key)
  try {
    await window.scourgify.clearPageTranslationCache(request(documentId, page, provider))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}
