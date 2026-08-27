import type { JSX } from "react"
import { copyFeature } from "../lib/featureCopy"
import type { PageOverlayState } from "../lib/pdfOverlayAnalysis"
import { pageOverlayStyle } from "../lib/pdfOverlayRefresh"
import type { DetectedStructure } from "../lib/structureDetector"
import { PaperStructureOverlay } from "./PaperStructureOverlay"

type PdfOverlayLayerProps = {
  readonly container: HTMLDivElement | null
  readonly pages: Readonly<Record<number, PageOverlayState>>
  readonly onTrigger?: ((structure: DetectedStructure) => void) | undefined
}

export function PdfOverlayLayer({
  container,
  pages,
  onTrigger,
}: PdfOverlayLayerProps): JSX.Element {
  return (
    <div className="paper-structure-host">
      {Object.entries(pages).map(([pageNumber, data]) => (
        <div
          key={pageNumber}
          data-page-number={pageNumber}
          style={{ position: "absolute", ...pageOverlayStyle(data.pageDiv, container) }}
        >
          <PaperStructureOverlay
            structures={data.structures}
            pageWidth={data.pageWidth}
            onTrigger={(item) => onTrigger?.(item)}
            onCopy={(item) => copyFeature(data.pageDiv, item)}
          />
        </div>
      ))}
    </div>
  )
}
