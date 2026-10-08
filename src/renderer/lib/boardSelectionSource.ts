import { type BoardTextSelection, captureNativeBoardTextSelection } from "./boardSelection"
import { pageTranslationBlocks } from "./pageTranslationBlocksRegistry"
import { captureTranslationSelection } from "./pageTranslationSelection"
import { addSelectionContext } from "./selectionContext"

function sourcePage(pageNumber: string | null): HTMLElement | null {
  return pageNumber
    ? document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
    : null
}

/**
 * The passage the reader has selected on the board: text on a PDF page, or text in a page's
 * translation pane, which stands for the source sentences it renders.
 */
export function boardSelectionOf(
  nativeSelection: Selection | null,
  boardWorldElement: HTMLElement | null,
): BoardTextSelection | null {
  const range = nativeSelection?.rangeCount ? nativeSelection.getRangeAt(0) : null
  const anchorNode = nativeSelection?.anchorNode
  const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
  if (!nativeSelection || nativeSelection.isCollapsed || !range || !boardWorldElement) return null
  const pageElement = anchorElement?.closest<HTMLElement>(".page")
  if (pageElement) {
    const selection = captureNativeBoardTextSelection({
      pageElement,
      boardWorldElement,
      range,
      quote: nativeSelection.toString(),
    })
    return selection ? addSelectionContext(selection, pageElement) : null
  }
  const paneElement = anchorElement?.closest<HTMLElement>(".page-translation-pane")
  const pageNumber = paneElement?.getAttribute("data-page-number") ?? null
  const translatedPage = paneElement ? sourcePage(pageNumber) : null
  if (!paneElement || !translatedPage) return null
  const selection = captureTranslationSelection({
    paneElement,
    pageElement: translatedPage,
    boardWorldElement,
    range,
    blocks: pageTranslationBlocks(Number(pageNumber)),
  })
  return selection ? addSelectionContext(selection, translatedPage) : null
}
