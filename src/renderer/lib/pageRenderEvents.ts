const pageRenderedEvent = "ohmypaper:page-rendered"

/** Tells listeners that PDF.js finished drawing a page's canvas. */
export function announcePageRendered(pageNumber: number): void {
  window.dispatchEvent(new CustomEvent(pageRenderedEvent, { detail: { pageNumber } }))
}

export function onPageRendered(pageNumber: number, listener: () => void): () => void {
  const handle = (event: Event): void => {
    if (event instanceof CustomEvent && event.detail?.pageNumber === pageNumber) listener()
  }
  window.addEventListener(pageRenderedEvent, handle)
  return () => window.removeEventListener(pageRenderedEvent, handle)
}
