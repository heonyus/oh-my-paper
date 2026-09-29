import { FileText } from "lucide-react"
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
import { type JSX, useEffect, useRef, useState } from "react"
import type { DocumentRecord } from "../types"
import { getCachedThumbnail, storeCachedThumbnail } from "./documentThumbnailCache"

GlobalWorkerOptions.workerSrc = workerUrl

export function DocumentThumbnail({
  document,
}: {
  readonly document: DocumentRecord
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined")
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const element = host.current
    if (!element || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      { rootMargin: "120px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let active = true
    let activeLoadingTask: { destroy: () => Promise<void> } | null = null
    let activeRenderTask: { cancel: () => void } | null = null

    const cached = getCachedThumbnail(document.id)
    const target = canvas.current
    const context = target?.getContext("2d")
    if (cached && target && context) {
      target.width = cached.width
      target.height = cached.height
      target.style.width = cached.styleWidth
      target.style.height = cached.styleHeight
      const img = new Image()
      img.onload = () => {
        if (active) {
          context.drawImage(img, 0, 0)
          setRendered(true)
        }
      }
      img.src = cached.dataUrl
      return () => {
        active = false
      }
    }

    void (async () => {
      try {
        const bytes = await window.ohmypaper.readDocument(document.id)
        if (!active) return
        const task = getDocument({ data: bytes })
        activeLoadingTask = task
        try {
          const pdf = await task.promise
          if (!active) return
          const page = await pdf.getPage(1)
          if (!active) return
          const initial = page.getViewport({ scale: 1 })
          const scale = Math.min(360 / initial.width, 240 / initial.height)
          const viewport = page.getViewport({ scale })
          const currentTarget = canvas.current
          const currentContext = currentTarget?.getContext("2d")
          if (!active || !currentTarget || !currentContext) return
          const ratio = Math.min(window.devicePixelRatio || 1, 2)
          currentTarget.width = Math.ceil(viewport.width * ratio)
          currentTarget.height = Math.ceil(viewport.height * ratio)
          currentTarget.style.width = `${viewport.width}px`
          currentTarget.style.height = `${viewport.height}px`
          const renderTask = page.render({
            canvas: currentTarget,
            canvasContext: currentContext,
            viewport,
            transform: [ratio, 0, 0, ratio, 0, 0],
          })
          activeRenderTask = renderTask
          await renderTask.promise
          if (active) {
            setRendered(true)
            try {
              storeCachedThumbnail(document.id, {
                dataUrl: currentTarget.toDataURL(),
                width: currentTarget.width,
                height: currentTarget.height,
                styleWidth: currentTarget.style.width,
                styleHeight: currentTarget.style.height,
              })
            } catch {
              // toDataURL may fail in some environments; ignore gracefully
            }
          }
        } finally {
          await task.destroy()
          activeLoadingTask = null
          activeRenderTask = null
        }
      } catch (error: unknown) {
        const isCancelled = error instanceof Error && error.name === "RenderingCancelledException"
        if (active && !isCancelled) {
          setRendered(false)
        }
      }
    })()

    return () => {
      active = false
      activeRenderTask?.cancel()
      void activeLoadingTask?.destroy()
    }
  }, [document.id, visible])

  return (
    <div ref={host} className="document-thumbnail" data-rendered={rendered}>
      <FileText size={28} aria-hidden="true" />
      <canvas ref={canvas} role="img" aria-label={`${document.title} 첫 페이지 미리보기`} />
    </div>
  )
}
