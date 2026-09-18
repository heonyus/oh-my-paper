export const MAX_THUMBNAIL_CACHE_SIZE = 30

export type CachedThumbnail = {
  readonly dataUrl: string
  readonly width: number
  readonly height: number
  readonly styleWidth: string
  readonly styleHeight: string
}

const thumbnailCache = new Map<string, CachedThumbnail>()

export function getCachedThumbnail(documentId: string): CachedThumbnail | undefined {
  const entry = thumbnailCache.get(documentId)
  if (!entry) return undefined
  // Refresh LRU recency
  thumbnailCache.delete(documentId)
  thumbnailCache.set(documentId, entry)
  return entry
}

export function storeCachedThumbnail(documentId: string, thumbnail: CachedThumbnail): void {
  if (thumbnailCache.size >= MAX_THUMBNAIL_CACHE_SIZE && !thumbnailCache.has(documentId)) {
    const oldest = thumbnailCache.keys().next().value
    if (oldest !== undefined) {
      thumbnailCache.delete(oldest)
    }
  }
  thumbnailCache.set(documentId, thumbnail)
}

export function clearCachedThumbnail(documentId: string): void {
  thumbnailCache.delete(documentId)
}

export function clearThumbnailCache(): void {
  thumbnailCache.clear()
}

export function getThumbnailCacheSize(): number {
  return thumbnailCache.size
}
