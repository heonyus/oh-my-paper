import type { JSX } from "react"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
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

const paperOrigin = { x: 300, y: 64 } as const

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
  return (
    <div
      className="pdf-surface"
      style={{
        transform: `translate(${viewport.x + paperOrigin.x * viewport.zoom}px, ${viewport.y + paperOrigin.y * viewport.zoom}px)`,
      }}
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
      />
    </div>
  )
}
