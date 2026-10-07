import {
  type EventBus,
  PDFFindController,
  type PDFLinkService,
} from "pdfjs-dist/legacy/web/pdf_viewer.mjs"

type RevealingFindControllerOptions = {
  readonly eventBus: EventBus
  readonly linkService: PDFLinkService
  /** Brings the selected match into view; the reader moves its own viewport, not a scrollbar. */
  readonly reveal: (page: number, element: HTMLElement) => void
}

/**
 * PDF.js's find controller, except that the selected match is shown through the reader's
 * viewport: the pages sit on a board that is panned, not scrolled, so `scrollIntoView` would
 * leave the board's own position out of step.
 */
export function createRevealingFindController(
  options: RevealingFindControllerOptions,
): PDFFindController {
  class RevealingFindController extends PDFFindController {
    override scrollMatchIntoView({
      element,
      pageIndex,
      matchIndex,
    }: {
      element: HTMLElement
      pageIndex: number
      matchIndex: number
    }): void {
      if (!this._scrollMatches || !element) return
      if (matchIndex === -1 || matchIndex !== this._selected?.matchIdx) return
      if (pageIndex === -1 || pageIndex !== this._selected?.pageIdx) return
      this._scrollMatches = false
      options.reveal(pageIndex + 1, element)
    }
  }
  return new RevealingFindController({
    eventBus: options.eventBus,
    linkService: options.linkService,
    delay: 150,
  })
}
