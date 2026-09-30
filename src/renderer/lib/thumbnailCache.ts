import type { Sha256 } from "../../shared/schemas"
import type { ThumbnailStorage } from "./thumbnailStorage"

/** A rendered first page; `density` device pixels make one CSS pixel. */
export type Thumbnail = {
  readonly image: Blob
  readonly width: number
  readonly height: number
  readonly density: number
}

export type ThumbnailCache = {
  /** The session copy only, without touching storage. */
  readonly peek: (hash: Sha256) => Thumbnail | null
  readonly load: (hash: Sha256) => Promise<Thumbnail | null>
  readonly save: (hash: Sha256, thumbnail: Thumbnail) => Promise<void>
  readonly clearMemory: () => void
}

export type ThumbnailCacheOptions = {
  readonly storage: ThumbnailStorage | null
  readonly memoryLimit: number
  readonly persistedLimit: number
  readonly now: () => number
}

export const MEMORY_THUMBNAIL_LIMIT = 200
export const PERSISTED_THUMBNAIL_LIMIT = 600
/** Recency is refreshed at most this often, so reopening the library does not rewrite every row. */
export const THUMBNAIL_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Keeps recent thumbnails in memory for this session and the rest in persistent storage,
 * evicting the least recently used beyond each bound. Storage failures read as misses.
 */
export function createThumbnailCache(options: ThumbnailCacheOptions): ThumbnailCache {
  const { storage, memoryLimit, persistedLimit, now } = options
  const memory = new Map<Sha256, Thumbnail>()

  const remember = (hash: Sha256, thumbnail: Thumbnail): void => {
    memory.delete(hash)
    memory.set(hash, thumbnail)
    for (const oldest of memory.keys()) {
      if (memory.size <= memoryLimit) break
      memory.delete(oldest)
    }
  }

  const prune = async (store: ThumbnailStorage): Promise<void> => {
    const hashes = await store.hashesByAge()
    const excess = hashes.length - persistedLimit
    if (excess > 0) await store.remove(hashes.slice(0, excess))
  }

  return {
    peek: (hash) => memory.get(hash) ?? null,
    load: async (hash) => {
      const cached = memory.get(hash)
      if (cached) {
        remember(hash, cached)
        return cached
      }
      if (!storage) return null
      try {
        const stored = await storage.read(hash)
        if (!stored) return null
        const { image, width, height, density } = stored
        const thumbnail: Thumbnail = { image, width, height, density }
        remember(hash, thumbnail)
        const time = now()
        if (time - stored.usedAt > THUMBNAIL_TOUCH_INTERVAL_MS)
          void storage.write({ ...stored, usedAt: time }).catch(() => undefined)
        return thumbnail
      } catch {
        return null
      }
    },
    save: async (hash, thumbnail) => {
      remember(hash, thumbnail)
      if (!storage) return
      try {
        await storage.write({ hash, ...thumbnail, usedAt: now() })
        await prune(storage)
      } catch {
        // Private browsing, a full quota or a blocked database leave the session copy only.
      }
    },
    clearMemory: () => memory.clear(),
  }
}
