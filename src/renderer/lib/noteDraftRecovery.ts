const writers = new Set<() => Promise<void>>()

export function registerNoteDraftRecovery(writer: () => Promise<void>): () => void {
  writers.add(writer)
  return () => {
    writers.delete(writer)
  }
}

export async function savePendingNoteDrafts(): Promise<void> {
  for (const write of writers) await write()
}
