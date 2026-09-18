import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs"
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = workerUrl
