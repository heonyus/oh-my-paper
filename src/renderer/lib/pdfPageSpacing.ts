/** Space between pages on the board, in board-world units, the same at every zoom. */
export const pageGap = 16

export type SpacedPageView = {
  readonly div?: HTMLElement | null
  readonly viewport?: { readonly height: number } | null
}

export type SpacedViewer = {
  readonly getPageView: (index: number) => SpacedPageView | null | undefined
}

/**
 * Keeps every page's top at the same board-world position whatever the zoom. PDF.js sizes a
 * page to whole screen pixels, and a fixed screen-pixel gap sat between pages, so a page's
 * world position drifted by up to a line as the zoom changed, and a card anchored to its
 * passage at one zoom drew beside it at another. Each page's bottom margin now carries the
 * gap at this scale plus whatever rounding took off the page's height.
 */
export function keepPageSpacing(viewer: SpacedViewer, scale: number): void {
  // Every height is read before any margin is written: a write between reads would make each
  // read lay the whole paper out again, once per page, every time a page is drawn.
  const margins: { readonly page: HTMLElement; readonly margin: number }[] = []
  for (let index = 0; ; index += 1) {
    const view = viewer.getPageView(index)
    if (!view) break
    const page = view.div
    const exactHeight = view.viewport?.height
    if (!page || exactHeight === undefined || exactHeight <= 0) continue
    const rendered = page.offsetHeight
    if (rendered <= 0) continue
    margins.push({ page, margin: pageGap * scale + (exactHeight - rendered) })
  }
  for (const { page, margin } of margins) page.style.marginBottom = `${margin}px`
}
