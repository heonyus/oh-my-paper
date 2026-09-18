import type { JSX, RefObject } from "react"
import type { PageOverlayState } from "../lib/pdfOverlayAnalysis"
import type { PdfColumnProps } from "./PdfColumnProps"
import { PdfOverlayLayer } from "./PdfOverlayLayer"

type PdfColumnViewProps = {
  readonly containerRef: RefObject<HTMLDivElement | null>
  readonly viewerRef: RefObject<HTMLDivElement | null>
  readonly pages: Readonly<Record<number, PageOverlayState>>
  readonly error: string | null
  readonly onStructureTrigger: PdfColumnProps["onStructureTrigger"]
}

export function PdfColumnView(props: PdfColumnViewProps): JSX.Element {
  return (
    <div ref={props.containerRef} className="pdf-viewer-container">
      <div ref={props.viewerRef} className="pdfViewer" />
      <PdfOverlayLayer
        container={props.containerRef.current}
        pages={props.pages}
        onTrigger={props.onStructureTrigger}
      />
      {props.error ? (
        <div className="reader-message" role="alert">
          {props.error}
        </div>
      ) : null}
    </div>
  )
}
