import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist"
import { type JSX, useEffect, useRef, useState } from "react"

type PageBounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type DisplaySize = {
  readonly width: number
  readonly height: number
}

const targetCssWidth = 860
const maxPixelRatio = 2

function markerStyle(bounds: PageBounds, source: DisplaySize, display: DisplaySize) {
  const scaleX = display.width / source.width
  const scaleY = display.height / source.height
  return {
    left: `${bounds.x * scaleX}px`,
    top: `${bounds.y * scaleY}px`,
    width: `${bounds.width * scaleX}px`,
    height: `${bounds.height * scaleY}px`,
  }
}

export function PdfPage({
  url,
  pageNumber,
  activeBounds,
  sourceSize,
  onPageCount,
}: {
  readonly url: string
  readonly pageNumber: number
  readonly activeBounds: PageBounds | null
  readonly sourceSize: DisplaySize | null
  readonly onPageCount: (count: number) => void
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [display, setDisplay] = useState<DisplaySize | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let loadingTask: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> } | null =
      null
    void (async () => {
      await import("./pdfRuntime")
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
      const task = getDocument({ url, withCredentials: true })
      loadingTask = task
      try {
        const loaded = await task.promise
        if (cancelled) {
          void task.destroy()
          return
        }
        setPdf(loaded)
        onPageCount(loaded.numPages)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [url, onPageCount])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!pdf || !canvas) return
    let cancelled = false
    let renderTask: RenderTask | null = null
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const scale = targetCssWidth / base.width
        const viewport = page.getViewport({ scale })
        const context = canvas.getContext("2d")
        if (!context) {
          setFailed(true)
          return
        }
        const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio)
        canvas.width = Math.ceil(viewport.width * ratio)
        canvas.height = Math.ceil(viewport.height * ratio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        })
        await renderTask.promise
        if (!cancelled) setDisplay({ width: viewport.width, height: viewport.height })
      } catch (error: unknown) {
        const isCancelled = error instanceof Error && error.name === "RenderingCancelledException"
        if (!cancelled && !isCancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdf, pageNumber])

  return (
    <div className="pdf-host">
      <div className="pdf-leaf">
        <canvas ref={canvasRef} />
        {failed ? <p className="translation-state error">PDF 페이지를 그리지 못했습니다.</p> : null}
        {activeBounds && sourceSize && display ? (
          <div
            className="source-marker"
            style={markerStyle(activeBounds, sourceSize, display)}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  )
}
