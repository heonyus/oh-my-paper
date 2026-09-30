import type { ProviderStatus } from "../../shared/ipc"
import type { CachedPageTranslationBlock } from "../../shared/pageTranslationCache"
import type { DocumentId } from "../../shared/schemas"
import { currentLocale } from "./locale"
import type { PageTranslationBlock } from "./pageTranslationSource"

const sessionCache = new Map<string, readonly PageTranslationBlock[]>()

export function pageTranslationCacheIdentity(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
  parser?: CachedPageTranslationBlock["sourceParser"],
  parserConfigVersion?: string,
): string {
  return `v10:${documentId}:${page}:${currentLocale()}:${provider.provider}:${provider.model}:${parser ?? "unknown"}:${parserConfigVersion ?? "unknown"}`
}

function pageTranslationCachePrefix(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
): string {
  return `v10:${documentId}:${page}:${currentLocale()}:${provider.provider}:${provider.model}:`
}

function request(
  documentId: DocumentId,
  page: number,
  provider: ProviderStatus,
  parser?: CachedPageTranslationBlock["sourceParser"],
  parserConfigVersion?: string,
) {
  return {
    id: documentId,
    pageNumber: page,
    targetLanguage: currentLocale(),
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

function comparable(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

/**
 * The Korean translation of a source passage, when this session already translated its page.
 * Translated blocks are matched by their source text, since pages are translated line by line
 * or paragraph by paragraph depending on the parser.
 */
export function cachedTranslationForPassage(
  documentId: DocumentId,
  page: number,
  passage: string,
): string | null {
  const target = comparable(passage)
  if (target.length < 12) return null
  const prefix = `v10:${documentId}:${page}:${currentLocale()}:`
  for (const [identity, blocks] of sessionCache) {
    if (!identity.startsWith(prefix)) continue
    const parts = blocks
      .filter((block) => {
        const source = comparable(block.source)
        return (
          source.length >= 12 && (target.includes(source) || source.includes(target.slice(0, 60)))
        )
      })
      .map((block) => block.translation.trim())
    if (parts.length > 0) return [...new Set(parts)].join(" ")
  }
  return null
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
    const stored = await window.ohmypaper.readPageTranslationCache(
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
    await window.ohmypaper.writePageTranslationCache({
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
    await window.ohmypaper.clearPageTranslationCache(request(documentId, page, provider))
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }
}
