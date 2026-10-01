/**
 * Runs `listener` when the page is going away (closed, reloaded, navigated off or hidden), so the
 * renderer can start its last save while the page still exists. The browser does not wait for the
 * returned promise; requests that must outlive the page are sent with `keepalive`.
 */
export function onPageClose(listener: () => Promise<void>): () => void {
  const run = (): void => {
    void listener().catch((error: unknown) => {
      console.warn("[workspace] save on page close failed", error)
    })
  }
  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") run()
  }
  window.addEventListener("pagehide", run)
  document.addEventListener("visibilitychange", onVisibility)
  return () => {
    window.removeEventListener("pagehide", run)
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
