import { GlobalWorkerOptions, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs"
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = workerUrl

let readerWorker: PDFWorker | null = null

/**
 * The worker the reader parses its papers in. PDF.js otherwise starts one per paper and ends it
 * when the paper closes, so every paper opened waited for the worker script to load and compile
 * again before its first page could be read.
 */
export function readerPdfWorker(): PDFWorker {
  if (!readerWorker || readerWorker.destroyed) readerWorker = new PDFWorker()
  return readerWorker
}
