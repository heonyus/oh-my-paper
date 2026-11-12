import { useEffect, useState } from "react"
import { onAnyPageRendered } from "./pageRenderEvents"

/** How long to wait for a paper whose first page never draws. */
const PAPER_GRACE_MS = 800

/**
 * Whether the paper just opened has a page on screen yet (or will not get one soon). What is
 * built around the paper, its cards and the translations beside its pages, waits on this:
 * built in the same breath, they held the page back that the reader opened the paper to see.
 */
export function usePaperShown(): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (shown) return
    const show = (): void => setShown(true)
    const timer = window.setTimeout(show, PAPER_GRACE_MS)
    const release = onAnyPageRendered(show)
    return () => {
      window.clearTimeout(timer)
      release()
    }
  }, [shown])
  return shown
}
