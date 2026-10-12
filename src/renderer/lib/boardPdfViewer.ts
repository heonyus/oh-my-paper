import { PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import {
  clippingAncestor,
  type LayoutPageView,
  visibleBoundsThrough,
  visiblePageViews,
} from "./pdfVisiblePages"

type PdfViewerOptions = ConstructorParameters<typeof PDFViewer>[0]

/**
 * A PDF.js viewer whose pages are carried across the board by a transform rather than scrolled:
 * it takes the pages on screen from the box the board shows them through, so only those (and
 * the one PDF.js draws ahead) are rendered and kept, instead of every page of the paper.
 */
export class BoardPdfViewer extends PDFViewer {
  readonly #host: Element | null

  constructor(options: PdfViewerOptions) {
    super(options)
    this.#host = clippingAncestor(options.container)
  }

  override _getVisiblePages(): object {
    const bounds = this.#host ? visibleBoundsThrough(this.#host, this.container) : null
    if (!bounds) return super._getVisiblePages()
    const pages: readonly LayoutPageView[] = this._pages ?? []
    return visiblePageViews(pages, bounds)
  }

  /**
   * Re-plans rendering whenever a page enters or leaves the box the board shows it through. The
   * board moves pages with transforms, so the container's scroll events PDF.js listens to never
   * fire; the observer is the equivalent signal. Returns the release.
   */
  watchPagesInView(): () => void {
    const host = this.#host
    if (!host || typeof IntersectionObserver !== "function") return () => {}
    let frame: number | null = null
    const observer = new IntersectionObserver(
      () => {
        if (frame !== null) return
        frame = requestAnimationFrame(() => {
          frame = null
          this.update()
        })
      },
      { root: host },
    )
    for (const view of this._pages ?? []) observer.observe(view.div)
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }
}
