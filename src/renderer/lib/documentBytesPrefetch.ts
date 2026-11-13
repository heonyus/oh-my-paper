import type { DocumentId } from "../types"

/** How long bytes fetched ahead are kept for a reader that never asks for them. */
const UNCLAIMED_MS = 15_000

const ahead = new Map<DocumentId, Promise<Uint8Array>>()

/**
 * Starts reading a paper's file before the reader that will show it exists: while the app is
 * still starting after a reload, the reader's code and the workspace are loading anyway, and
 * the file used to be asked for only once all of that had finished and the reader was on screen.
 */
export function prefetchDocumentBytes(id: DocumentId): void {
  if (ahead.has(id)) return
  const reading = window.ohmypaper.readDocument(id)
  // The reader reports a failure when it takes the bytes; unclaimed, it is nobody's.
  reading.catch(() => undefined)
  ahead.set(id, reading)
  window.setTimeout(() => {
    if (ahead.get(id) === reading) ahead.delete(id)
  }, UNCLAIMED_MS)
}

/**
 * The paper's file: the read started ahead when there is one, else a read made now. Bytes
 * fetched ahead are handed out once, since PDF.js takes the buffer it is given for itself.
 */
export function takeDocumentBytes(id: DocumentId, signal?: AbortSignal): Promise<Uint8Array> {
  const reading = ahead.get(id)
  if (!reading) return window.ohmypaper.readDocument(id, signal)
  ahead.delete(id)
  return reading.catch(() => window.ohmypaper.readDocument(id, signal))
}
