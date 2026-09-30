/**
 * Starts `load` once the page is idle, so a lazily loaded screen is already there the first time
 * it opens instead of showing its loading line. Returns a cleanup for an effect.
 */
export function prefetchWhenIdle(load: () => Promise<unknown>): () => void {
  const start = (): void => {
    // A failed prefetch is retried by the lazy import when the screen actually opens.
    load().catch(() => undefined)
  }
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(start, { timeout: 3_000 })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = window.setTimeout(start, 1_500)
  return () => window.clearTimeout(timer)
}
