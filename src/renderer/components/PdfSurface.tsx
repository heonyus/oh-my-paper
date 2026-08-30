import { type JSX, useState } from "react"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import { alignedDevicePixel } from "../lib/pdfRenderQuality"
import type { DetectedStructure } from "../lib/structureDetector"
import type { DocumentRecord, Viewport } from "../types"
import { PdfColumn, type PreparedSummary } from "./PdfColumn"

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

export const PAPER_ORIGIN = { x: 300, y: 64 } as const

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
  const pixelRatio = window.devicePixelRatio || 1
  const x = alignedDevicePixel(viewport.x + PAPER_ORIGIN.x * viewport.zoom, pixelRatio)
  const y = alignedDevicePixel(viewport.y + PAPER_ORIGIN.y * viewport.zoom, pixelRatio)
  return (
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
        onScaleCommitted={setRenderedZoom}
      />
    </div>
  )
}
