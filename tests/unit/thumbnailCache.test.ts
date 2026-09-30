import { describe, expect, it } from "vitest"
import {
  createThumbnailCache,
  THUMBNAIL_TOUCH_INTERVAL_MS,
  type ThumbnailCacheOptions,
} from "../../src/renderer/lib/thumbnailCache"
import {
  browserIndexedDb,
  createIndexedDbThumbnailStorage,
} from "../../src/renderer/lib/thumbnailStorage"
import {
  failingThumbnailStorage,
  fakeThumbnailStorage,
  hashOf,
  thumbnailOf,
} from "../support/fakeThumbnailStorage"

function cacheWith(overrides: Partial<ThumbnailCacheOptions>) {
  return createThumbnailCache({
    storage: null,
    memoryLimit: 10,
    persistedLimit: 10,
    now: () => 1_000,
    ...overrides,
  })
}

describe("thumbnail cache", () => {
  it("serves the session copy first and misses when nothing is stored", async () => {
    const cache = cacheWith({})
    const hash = hashOf("a")

    expect(await cache.load(hash)).toBeNull()
    const thumbnail = thumbnailOf("a")
    await cache.save(hash, thumbnail)

    expect(cache.peek(hash)).toBe(thumbnail)
    expect(await cache.load(hash)).toBe(thumbnail)
  })

  it("restores a persisted thumbnail by content hash after the session is cleared", async () => {
    const storage = fakeThumbnailStorage()
    const first = cacheWith({ storage })
    const hash = hashOf("a")
    await first.save(hash, thumbnailOf("a"))

    const reopened = cacheWith({ storage })
    expect(reopened.peek(hash)).toBeNull()
    const restored = await reopened.load(hash)

    expect(restored).toMatchObject({ width: 20, height: 26, density: 2 })
    expect(reopened.peek(hash)).toBe(restored)
  })

  it("evicts the least recently used entries beyond each bound", async () => {
    let time = 0
    const storage = fakeThumbnailStorage()
    const cache = cacheWith({ storage, memoryLimit: 2, persistedLimit: 3, now: () => time })
    const [a, b, c, d] = ["a", "b", "c", "d"].map(hashOf)
    if (!a || !b || !c || !d) throw new Error("hashes")

    for (const hash of [a, b, c]) {
      time += 1
      await cache.save(hash, thumbnailOf(hash))
    }
    expect(cache.peek(a)).toBeNull()
    expect(cache.peek(b)).not.toBeNull()

    time += THUMBNAIL_TOUCH_INTERVAL_MS + 1
    await cache.load(a)
    await Promise.resolve()
    time += 1
    await cache.save(d, thumbnailOf("d"))

    expect([...storage.records.keys()].sort()).toEqual([a, c, d].sort())
  })

  it("refreshes stored recency at most once per interval", async () => {
    let time = 0
    const storage = fakeThumbnailStorage()
    const writer = cacheWith({ storage, now: () => time })
    const hash = hashOf("a")
    await writer.save(hash, thumbnailOf("a"))

    time = THUMBNAIL_TOUCH_INTERVAL_MS - 1
    await cacheWith({ storage, now: () => time }).load(hash)
    expect(storage.writes).toHaveLength(1)

    time = THUMBNAIL_TOUCH_INTERVAL_MS + 1
    await cacheWith({ storage, now: () => time }).load(hash)
    await Promise.resolve()
    expect(storage.writes).toHaveLength(2)
    expect(storage.records.get(hash)?.usedAt).toBe(time)
  })

  it("treats a failing store as a miss and keeps the session copy", async () => {
    const cache = cacheWith({ storage: failingThumbnailStorage() })
    const hash = hashOf("a")

    expect(await cache.load(hash)).toBeNull()
    await expect(cache.save(hash, thumbnailOf("a"))).resolves.toBeUndefined()
    expect(cache.peek(hash)).not.toBeNull()
  })

  it("has no persistent store where IndexedDB is missing or cannot open", async () => {
    expect(browserIndexedDb()).toBeUndefined()
    expect(createIndexedDbThumbnailStorage(undefined)).toBeNull()

    const blocked = createIndexedDbThumbnailStorage({
      open: () => {
        throw new DOMException("denied", "SecurityError")
      },
      deleteDatabase: () => {
        throw new DOMException("denied", "SecurityError")
      },
      cmp: () => 0,
      databases: async () => [],
    })
    expect(blocked).not.toBeNull()
    const cache = cacheWith({ storage: blocked })
    const hash = hashOf("a")
    expect(await cache.load(hash)).toBeNull()
    await cache.save(hash, thumbnailOf("a"))
    expect(cache.peek(hash)).not.toBeNull()
  })
})
