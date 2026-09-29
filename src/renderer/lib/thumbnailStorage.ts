import { z } from "zod"
import { type Sha256, sha256Schema } from "../../shared/schemas"

const DATABASE_NAME = "ohmypaper-thumbnails"
const DATABASE_VERSION = 1
const STORE_NAME = "first-pages"
const USED_AT_INDEX = "usedAt"

export const storedThumbnailSchema = z
  .object({
    hash: sha256Schema,
    image: z.instanceof(Blob),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    density: z.number().positive(),
    usedAt: z.number().nonnegative(),
  })
  .readonly()

export type StoredThumbnail = z.infer<typeof storedThumbnailSchema>

/** Persistent first-page images keyed by the PDF's content hash. */
export type ThumbnailStorage = {
  readonly read: (hash: Sha256) => Promise<StoredThumbnail | null>
  readonly write: (thumbnail: StoredThumbnail) => Promise<void>
  /** Hashes ordered from least to most recently used. */
  readonly hashesByAge: () => Promise<readonly Sha256[]>
  readonly remove: (hashes: readonly Sha256[]) => Promise<void>
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("thumbnail_request_failed"))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (): void => reject(transaction.error ?? new Error("thumbnail_transaction_failed"))
    transaction.oncomplete = () => resolve()
    transaction.onabort = fail
    transaction.onerror = fail
  })
}

function openDatabase(factory: IDBFactory, onClosed: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: "hash" })
      store.createIndex(USED_AT_INDEX, "usedAt")
    }
    request.onsuccess = () => {
      const database = request.result
      // Another tab upgrading the schema must not wait on this connection.
      database.onversionchange = () => {
        database.close()
        onClosed()
      }
      database.onclose = onClosed
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error("thumbnail_database_failed"))
    request.onblocked = () => reject(new Error("thumbnail_database_blocked"))
  })
}

/** The page's IndexedDB factory, or undefined where storage is missing or forbidden. */
export function browserIndexedDb(): IDBFactory | undefined {
  try {
    return typeof indexedDB === "undefined" ? undefined : indexedDB
  } catch {
    return undefined
  }
}

/**
 * Stores thumbnails in IndexedDB, opening the database on first use. Returns null without a
 * factory; every other failure surfaces as a rejected promise for the caller to absorb.
 */
export function createIndexedDbThumbnailStorage(
  factory: IDBFactory | undefined,
): ThumbnailStorage | null {
  if (!factory) return null
  let database: Promise<IDBDatabase> | null = null
  const open = (): Promise<IDBDatabase> => {
    database ??= openDatabase(factory, () => {
      database = null
    })
    return database
  }
  const transaction = async (mode: IDBTransactionMode): Promise<IDBTransaction> =>
    (await open()).transaction(STORE_NAME, mode)

  return {
    read: async (hash) => {
      const store = (await transaction("readonly")).objectStore(STORE_NAME)
      const parsed = storedThumbnailSchema.safeParse(await requestResult(store.get(hash)))
      return parsed.success ? parsed.data : null
    },
    write: async (thumbnail) => {
      const pending = await transaction("readwrite")
      pending.objectStore(STORE_NAME).put(thumbnail)
      await transactionDone(pending)
    },
    hashesByAge: async () => {
      const index = (await transaction("readonly")).objectStore(STORE_NAME).index(USED_AT_INDEX)
      const keys = await requestResult(index.getAllKeys())
      return keys.flatMap((key) => {
        const hash = sha256Schema.safeParse(key)
        return hash.success ? [hash.data] : []
      })
    },
    remove: async (hashes) => {
      if (hashes.length === 0) return
      const pending = await transaction("readwrite")
      const store = pending.objectStore(STORE_NAME)
      for (const hash of hashes) store.delete(hash)
      await transactionDone(pending)
    },
  }
}
