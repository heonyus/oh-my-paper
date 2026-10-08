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

const textLayerRenderedEvent = "ohmypaper:text-layer-rendered"

/** Tells listeners that PDF.js finished laying out a page's text layer. */
export function announceTextLayerRendered(pageNumber: number): void {
  window.dispatchEvent(new CustomEvent(textLayerRenderedEvent, { detail: { pageNumber } }))
}

export function onTextLayerRendered(listener: (pageNumber: number) => void): () => void {
  const handle = (event: Event): void => {
    const pageNumber: unknown = event instanceof CustomEvent ? event.detail?.pageNumber : null
    if (typeof pageNumber === "number") listener(pageNumber)
  }
  window.addEventListener(textLayerRenderedEvent, handle)
  return () => window.removeEventListener(textLayerRenderedEvent, handle)
}
