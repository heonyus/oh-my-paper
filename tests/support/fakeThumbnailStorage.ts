import type { Thumbnail } from "../../src/renderer/lib/thumbnailCache"
import type { StoredThumbnail, ThumbnailStorage } from "../../src/renderer/lib/thumbnailStorage"
import type { Sha256 } from "../../src/shared/schemas"
import { sha256Schema } from "../../src/shared/schemas"

/** An in-memory stand-in for the IndexedDB thumbnail store with the same ordering contract. */
export function fakeThumbnailStorage(): ThumbnailStorage & {
  readonly records: Map<Sha256, StoredThumbnail>
  readonly writes: StoredThumbnail[]
} {
  const records = new Map<Sha256, StoredThumbnail>()
  const writes: StoredThumbnail[] = []
  return {
    records,
    writes,
    read: async (hash) => records.get(hash) ?? null,
    write: async (thumbnail) => {
      writes.push(thumbnail)
      records.set(thumbnail.hash, thumbnail)
    },
    hashesByAge: async () =>
      [...records.values()].sort((left, right) => left.usedAt - right.usedAt).map((it) => it.hash),
    remove: async (hashes) => {
      for (const hash of hashes) records.delete(hash)
    },
  }
}

/** A storage whose every operation fails, as in private browsing or a full quota. */
export function failingThumbnailStorage(): ThumbnailStorage {
  const fail = async (): Promise<never> => {
    throw new DOMException("quota", "QuotaExceededError")
  }
  return { read: fail, write: fail, hashesByAge: fail, remove: fail }
}

export function hashOf(seed: string): Sha256 {
  return sha256Schema.parse(seed.repeat(64))
}

export function thumbnailOf(label: string): Thumbnail {
  return { image: new Blob([label], { type: "image/webp" }), width: 20, height: 26, density: 2 }
}
