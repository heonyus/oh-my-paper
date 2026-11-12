/**
 * A sideways trackpad swipe that nothing on the page scrolls is taken by the browser as "back"
 * or "forward", and the reader leaves the app mid-read. This keeps such a swipe in the page:
 * one that an element under the pointer can still scroll sideways goes to that element, and any
 * other is dropped before the browser acts on it.
 */

/** Whether an element under the pointer still has room to scroll the way the wheel points. */
function scrollsSideways(event: WheelEvent): boolean {
  for (
    let element = event.target instanceof Element ? event.target : null;
    element;
    element = element.parentElement
  ) {
    if (element.scrollWidth <= element.clientWidth + 1) continue
    const overflow = getComputedStyle(element).overflowX
    if (overflow !== "auto" && overflow !== "scroll") continue
    const room =
      event.deltaX < 0
        ? element.scrollLeft > 0
        : element.scrollLeft + element.clientWidth < element.scrollWidth - 1
    if (room) return true
  }
  return false
}

/** A wheel event the browser would turn into history navigation if it were left alone. */
export function wouldSwipeHistory(event: WheelEvent): boolean {
  // A pinch arrives with ctrlKey; a handler that already took the event has dealt with it.
  if (event.defaultPrevented || event.ctrlKey) return false
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return false
  return !scrollsSideways(event)
}

/** Installs the guard for the whole window; returns how to remove it. */
export function preventHistorySwipe(target: Window = window): () => void {
  const onWheel = (event: WheelEvent): void => {
    if (wouldSwipeHistory(event)) event.preventDefault()
  }
  // After the board's own wheel handling, and not passive, so the event can be cancelled.
  target.addEventListener("wheel", onWheel, { passive: false })
  return () => target.removeEventListener("wheel", onWheel)
}
