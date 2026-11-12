import {
  type ComponentProps,
  type JSX,
  type ReactNode,
  useEffect,
  useSyncExternalStore,
} from "react"
import { documentIdSchema } from "../../shared/schemas"
import { prefetchDocumentBytes } from "../lib/documentBytesPrefetch"
import { windowDocument, windowWasReading } from "../lib/windowView"

type ReaderModule = typeof import("./ReaderWorkspace")
type Reader = ReaderModule["ReaderWorkspace"]

let loadedReader: Reader | null = null
let loadFailure: unknown = null
let readerLoading: Promise<ReaderModule> | null = null
const watchers = new Set<() => void>()

function watch(onChange: () => void): () => void {
  watchers.add(onChange)
  return () => watchers.delete(onChange)
}

function settle(reader: Reader | null, failure: unknown): void {
  loadedReader = reader
  loadFailure = failure
  for (const onChange of watchers) onChange()
}

function loadReader(): Promise<ReaderModule> {
  if (readerLoading) return readerLoading
  if (loadFailure !== null) settle(null, null)
  readerLoading = import("./ReaderWorkspace").then(
    (module) => {
      settle(module.ReaderWorkspace, null)
      return module
    },
    (error: unknown) => {
      readerLoading = null
      settle(null, error ?? new Error("reader failed to load"))
      throw error
    },
  )
  return readerLoading
}

/**
 * Fetches the reader's code and starts its PDF worker while the library is on screen, so the
 * first paper opened waits for neither.
 */
export async function warmReader(): Promise<void> {
  // Side by side: the worker's script is as large as the reader's and needs none of it.
  await Promise.all([loadReader(), startPdfWorker()])
}

async function startPdfWorker(): Promise<void> {
  // jsdom has no workers; PDF.js would fall back to parsing on the main thread there.
  if (typeof Worker !== "function") return
  const { readerPdfWorker } = await import("../lib/pdfWorker")
  await readerPdfWorker().promise
}

/**
 * A window reloaded while a paper was being read goes straight back to it. Everything the
 * reader will need is asked for at once, alongside the workspace: its code, its PDF worker and
 * the paper's file. They used to be asked for one after another, each only once the one before
 * had arrived and been drawn.
 */
export function startReaderAhead(): void {
  if (!windowWasReading()) return
  void warmReader().catch(() => undefined)
  const reading = documentIdSchema.safeParse(windowDocument())
  if (reading.success) prefetchDocumentBytes(reading.data)
}

/**
 * The reader, drawn in the same step as whatever opens a paper once its code is in, and
 * `fallback` until then. It is not a lazy component under Suspense: one of those suspends the
 * first time it is drawn even when its code has already arrived, and React then keeps the
 * fallback up for a third of a second so it does not flash, time during which nothing loads.
 */
export function ReaderWorkspace({
  fallback,
  ...props
}: ComponentProps<Reader> & { readonly fallback: ReactNode }): JSX.Element {
  const Component = useSyncExternalStore(watch, () => loadedReader)
  const failure = useSyncExternalStore(watch, () => loadFailure)
  useEffect(() => {
    if (!loadedReader) void loadReader().catch(() => undefined)
  }, [])
  if (Component) return <Component {...props} />
  // As a lazy component would: to the nearest error boundary.
  if (failure !== null) throw failure
  return <>{fallback}</>
}
