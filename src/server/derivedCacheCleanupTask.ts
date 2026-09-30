import { cleanDerivedCaches } from "../electron/derivedCacheCleanup"
import type { WorkspaceStore } from "../electron/workspaceStore"

/** The cleanup waits this long after startup so it never competes with it. */
const START_DELAY_MS = 60_000

async function cleanStoreCaches(store: WorkspaceStore, signal: AbortSignal): Promise<void> {
  // A collection keeps its caches beside the reader's own files; they are left alone.
  if (store.collection) return
  const documents = await store.listDocuments()
  if (signal.aborted) return
  const hashes = new Set<string>(documents.map((document) => document.hash))
  const ids = new Set<string>(documents.map((document) => document.id))
  const result = await cleanDerivedCaches({
    root: store.root,
    signal,
    // Papers imported after the list was read already have their versions recorded.
    isLibraryHash: (hash) =>
      hashes.has(hash) || store.repository.findDocumentVersionsByHash(hash).length > 0,
    isLibraryDocument: (id) =>
      ids.has(id) || store.repository.findDocumentVersionsByDocId(id).length > 0,
  })
  if (result.failed > 0)
    console.warn(`[cache-cleanup] ${result.failed} cache entries could not be removed`)
}

/**
 * Runs one low-priority cleanup of derived caches a while after startup. `stop` cancels it
 * and resolves once no removal is in flight, so the store can close behind it.
 */
export function scheduleDerivedCacheCleanup(
  store: WorkspaceStore,
  delayMs = START_DELAY_MS,
): { readonly stop: () => Promise<void> } {
  const controller = new AbortController()
  let running: Promise<void> = Promise.resolve()
  const timer = setTimeout(() => {
    running = cleanStoreCaches(store, controller.signal).catch((error: unknown) => {
      console.warn("[cache-cleanup] derived cache cleanup stopped", error)
    })
  }, delayMs)
  timer.unref()
  return {
    stop: async () => {
      clearTimeout(timer)
      controller.abort()
      await running
    },
  }
}
