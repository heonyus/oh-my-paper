import { type ComponentProps, type JSX, lazy, useState } from "react"

type ReaderModule = typeof import("./ReaderWorkspace")
type Reader = ReaderModule["ReaderWorkspace"]

let loadedReader: Reader | null = null
let readerLoading: Promise<ReaderModule> | null = null

function loadReader(): Promise<ReaderModule> {
  readerLoading ??= import("./ReaderWorkspace").then(
    (module) => {
      loadedReader = module.ReaderWorkspace
      return module
    },
    (error: unknown) => {
      readerLoading = null
      throw error
    },
  )
  return readerLoading
}

const LazyReader = lazy(() => loadReader().then((module) => ({ default: module.ReaderWorkspace })))

/**
 * Fetches the reader's code and starts its PDF worker while the library is on screen, so the
 * first paper opened waits for neither.
 */
export async function warmReader(): Promise<void> {
  await loadReader()
  // jsdom has no workers; PDF.js would fall back to parsing on the main thread there.
  if (typeof Worker !== "function") return
  const { readerPdfWorker } = await import("../lib/pdfWorker")
  await readerPdfWorker().promise
}

/**
 * The reader, drawn in the same step as the click that opens a paper once its code is in.
 * A lazy component suspends the first time it is drawn even when its code has already arrived,
 * and React then keeps the "opening…" line up for a third of a second so it does not flash:
 * time during which nothing was loading. Until `warmReader` has finished, it loads lazily
 * under the caller's Suspense as before.
 */
export function ReaderWorkspace(props: ComponentProps<Reader>): JSX.Element {
  // Chosen once per paper: swapping one for the other mid-read would build the reader again.
  const [Component] = useState(() => loadedReader ?? LazyReader)
  return <Component {...props} />
}
