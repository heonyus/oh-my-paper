import type { DocumentId, Sha256 } from "../../shared/schemas"
import { abortReason, createTaskQueue, type TaskQueue } from "./taskQueue"
import {
  createThumbnailCache,
  MEMORY_THUMBNAIL_LIMIT,
  PERSISTED_THUMBNAIL_LIMIT,
  type Thumbnail,
  type ThumbnailCache,
} from "./thumbnailCache"
import { browserIndexedDb, createIndexedDbThumbnailStorage } from "./thumbnailStorage"

export type ThumbnailSource = { readonly id: DocumentId; readonly hash: Sha256 }

export type ThumbnailLoader = {
  readonly peek: (hash: Sha256) => Thumbnail | null
  /** Resolves null when the paper cannot be rendered; rejects once `signal` aborts. */
  readonly request: (source: ThumbnailSource, signal: AbortSignal) => Promise<Thumbnail | null>
  readonly clearMemory: () => void
}

type Flight = {
  readonly promise: Promise<Thumbnail | null>
  readonly controller: AbortController
  readonly consumers: Set<AbortSignal>
}

/** At most this many papers are downloaded and parsed for thumbnails at once. */
export const THUMBNAIL_RENDER_CONCURRENCY = 2

/**
 * Serves thumbnails from the cache and renders misses through `queue`. Every thumbnail showing
 * the same content shares one load, which is cancelled once none of them still wants it.
 */
export function createThumbnailLoader(dependencies: {
  readonly cache: ThumbnailCache
  readonly queue: TaskQueue
  readonly render: (source: ThumbnailSource, signal: AbortSignal) => Promise<Thumbnail>
}): ThumbnailLoader {
  const { cache, queue, render } = dependencies
  const flights = new Map<Sha256, Flight>()
  const unrenderable = new Set<Sha256>()

  const start = (source: ThumbnailSource): Flight => {
    const controller = new AbortController()
    const promise = (async (): Promise<Thumbnail | null> => {
      const stored = await cache.load(source.hash)
      if (stored) return stored
      try {
        const thumbnail = await queue.run((signal) => render(source, signal), controller.signal)
        void cache.save(source.hash, thumbnail)
        return thumbnail
      } catch (error) {
        if (controller.signal.aborted) throw error
        unrenderable.add(source.hash)
        return null
      }
    })()
    const flight: Flight = { promise, controller, consumers: new Set() }
    const settle = (): void => {
      if (flights.get(source.hash) === flight) flights.delete(source.hash)
    }
    promise.then(settle, settle)
    flights.set(source.hash, flight)
    return flight
  }

  const request = (source: ThumbnailSource, signal: AbortSignal): Promise<Thumbnail | null> => {
    const cached = cache.peek(source.hash)
    if (cached) return Promise.resolve(cached)
    if (unrenderable.has(source.hash)) return Promise.resolve(null)
    if (signal.aborted) return Promise.reject(abortReason(signal))
    const flight = flights.get(source.hash) ?? start(source)
    flight.consumers.add(signal)
    return new Promise((resolve, reject) => {
      const leave = (): void => {
        signal.removeEventListener("abort", abandon)
        flight.consumers.delete(signal)
      }
      const abandon = (): void => {
        leave()
        if (flight.consumers.size === 0 && flights.get(source.hash) === flight) {
          flights.delete(source.hash)
          flight.controller.abort()
        }
        reject(abortReason(signal))
      }
      signal.addEventListener("abort", abandon, { once: true })
      flight.promise.then(
        (thumbnail) => {
          leave()
          resolve(thumbnail)
        },
        (error: unknown) => {
          leave()
          reject(error)
        },
      )
    })
  }

  return {
    peek: cache.peek,
    request,
    clearMemory: () => {
      cache.clearMemory()
      unrenderable.clear()
    },
  }
}

/** The library's shared loader: IndexedDB-backed, rendering through the app's PDF bridge. */
export const documentThumbnails = createThumbnailLoader({
  cache: createThumbnailCache({
    storage: createIndexedDbThumbnailStorage(browserIndexedDb()),
    memoryLimit: MEMORY_THUMBNAIL_LIMIT,
    persistedLimit: PERSISTED_THUMBNAIL_LIMIT,
    now: Date.now,
  }),
  queue: createTaskQueue(THUMBNAIL_RENDER_CONCURRENCY),
  render: async (source, signal) => {
    const bytes = await window.ohmypaper.readDocument(source.id, signal)
    // pdf.js loads only when a thumbnail is missing from the cache.
    const { renderFirstPageThumbnail } = await import("./thumbnailRender")
    return renderFirstPageThumbnail(bytes, signal)
  },
})
