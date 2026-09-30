import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import "./pdfWorker"
import type { Thumbnail } from "./thumbnailCache"

/** The CSS box a first page is fitted into. */
const THUMBNAIL_BOX_WIDTH = 360
const THUMBNAIL_BOX_HEIGHT = 240
/** Rendered at a fixed density so one cached image serves every display. */
export const THUMBNAIL_DENSITY = 2
const WEBP_QUALITY = 0.8
const JPEG_QUALITY = 0.82

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Encodes as WebP, or as JPEG where the browser cannot encode WebP. */
async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await canvasBlob(canvas, "image/webp", WEBP_QUALITY)
  if (webp?.type === "image/webp") return webp
  const jpeg = await canvasBlob(canvas, "image/jpeg", JPEG_QUALITY)
  if (jpeg) return jpeg
  throw new Error("thumbnail_encode_failed")
}

/** Renders page 1 into a detached canvas and returns it as a compact image. */
export async function renderFirstPageThumbnail(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<Thumbnail> {
  signal.throwIfAborted()
  const loadingTask = getDocument({ data: bytes })
  let renderTask: { readonly cancel: () => void } | null = null
  const abort = (): void => {
    renderTask?.cancel()
    void loadingTask.destroy()
  }
  signal.addEventListener("abort", abort, { once: true })
  const canvas = document.createElement("canvas")
  try {
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)
    signal.throwIfAborted()
    const initial = page.getViewport({ scale: 1 })
    const fit = Math.min(THUMBNAIL_BOX_WIDTH / initial.width, THUMBNAIL_BOX_HEIGHT / initial.height)
    const viewport = page.getViewport({ scale: fit * THUMBNAIL_DENSITY })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext("2d")
    if (!context) throw new Error("thumbnail_canvas_unavailable")
    const task = page.render({ canvas, canvasContext: context, viewport })
    renderTask = task
    await task.promise
    signal.throwIfAborted()
    const image = await encodeCanvas(canvas)
    return { image, width: canvas.width, height: canvas.height, density: THUMBNAIL_DENSITY }
  } finally {
    signal.removeEventListener("abort", abort)
    // Release the pixel buffer now instead of whenever the canvas is collected.
    canvas.width = 0
    canvas.height = 0
    await loadingTask.destroy()
  }
}
