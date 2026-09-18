export function createClosePreparation() {
  const callbacks = new Set<() => Promise<void>>()
  return {
    register(callback: () => Promise<void>): () => void {
      callbacks.add(callback)
      return () => {
        callbacks.delete(callback)
      }
    },
    async prepare(): Promise<void> {
      await Promise.all([...callbacks].map((callback) => callback()))
    },
  }
}
