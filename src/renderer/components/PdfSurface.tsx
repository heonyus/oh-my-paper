import { type JSX, useCallback, useState } from "react"
import { flushSync } from "react-dom"
import { paperOrigin } from "../../shared/uiLayout"
import type { PreparedSummary } from "../lib/pdfDocumentFeatures"
import type { PdfFindRuntime } from "../lib/pdfFindRuntime"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import { alignedDevicePixel } from "../lib/pdfRenderQuality"
import type { PdfRetrievalRuntime } from "../lib/pdfRetrievalRuntime"
import type { DetectedStructure } from "../lib/structureDetector"
import type { DocumentRecord, Viewport } from "../types"
import { DocumentFindBar } from "./DocumentFindBar"
import { DocumentRetrievalSwitcher } from "./DocumentRetrievalSwitcher"
import { PdfColumn } from "./PdfColumn"

type PdfSurfaceProps = {
  readonly document: DocumentRecord
  readonly viewport: Viewport
  readonly onLoaded: (summary: PreparedSummary) => void
  readonly onPageActive: (page: number) => void
  readonly onOutlineChange?: ((outline: readonly PdfOutlineEntry[]) => void) | undefined
  readonly onRegisterPageJump?: ((jump: (page: number) => void) => void) | undefined
  readonly onPageJump?: ((page: number, pageElement: HTMLElement) => void) | undefined
  readonly onStructureTrigger?: (structure: DetectedStructure) => void
}

export function PdfSurface({
  document,
  viewport,
  onLoaded,
  onPageActive,
  onOutlineChange,
  onRegisterPageJump,
  onPageJump,
  onStructureTrigger,
}: PdfSurfaceProps): JSX.Element {
  const [renderedZoom, setRenderedZoom] = useState(viewport.zoom)
  const [retrievalRuntime, setRetrievalRuntime] = useState<PdfRetrievalRuntime | null>(null)
  const [findRuntime, setFindRuntime] = useState<PdfFindRuntime | null>(null)
  const commitRenderedZoom = useCallback((nextZoom: number): void => {
    flushSync(() => setRenderedZoom(nextZoom))
  }, [])
  const pixelRatio = window.devicePixelRatio || 1
  const x = alignedDevicePixel(viewport.x + paperOrigin.x * viewport.zoom, pixelRatio)
  const y = alignedDevicePixel(viewport.y + paperOrigin.y * viewport.zoom, pixelRatio)
  return (
    <>
      <div
        className="pdf-surface"
        style={{
          transform: `translate(${x}px, ${y}px) scale(${viewport.zoom / renderedZoom})`,
          transformOrigin: "0 0",
        }}
        data-zoom={viewport.zoom}
        data-rendered-zoom={renderedZoom}
      >
        <PdfColumn
          document={document}
          zoom={viewport.zoom}
          onLoaded={onLoaded}
          onPageActive={onPageActive}
          onOutlineChange={onOutlineChange}
          onRegisterPageJump={onRegisterPageJump}
          onPageJump={onPageJump}
          onStructureTrigger={onStructureTrigger}
          onRetrievalReady={setRetrievalRuntime}
          onFindReady={setFindRuntime}
          onScaleCommitted={commitRenderedZoom}
        />
      </div>
      <DocumentFindBar key={`find:${document.id}`} runtime={findRuntime} />
      <DocumentRetrievalSwitcher key={document.id} runtime={retrievalRuntime} />
    </>
  )
}
