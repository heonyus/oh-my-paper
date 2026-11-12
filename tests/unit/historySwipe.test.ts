import { afterEach, describe, expect, it } from "vitest"
import { preventHistorySwipe } from "../../src/renderer/lib/historySwipe"

function wheel(target: Element, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

/** A strip 200px wide holding 600px of content, scrolled to `scrollLeft`. */
function sidewaysScroller(scrollLeft: number): HTMLElement {
  const strip = document.createElement("div")
  strip.style.overflowX = "auto"
  Object.defineProperty(strip, "scrollWidth", { value: 600, configurable: true })
  Object.defineProperty(strip, "clientWidth", { value: 200, configurable: true })
  strip.scrollLeft = scrollLeft
  document.body.append(strip)
  return strip
}

describe("history swipe guard", () => {
  let remove = (): void => undefined
  afterEach(() => {
    remove()
    document.body.replaceChildren()
  })

  it("drops a sideways swipe that nothing scrolls, so the browser does not go back", () => {
    remove = preventHistorySwipe()
    const toolbar = document.createElement("header")
    document.body.append(toolbar)

    expect(wheel(toolbar, { deltaX: -60, deltaY: 4 }).defaultPrevented).toBe(true)
    expect(wheel(toolbar, { deltaX: 60, deltaY: 0 }).defaultPrevented).toBe(true)
  })

  it("leaves upright scrolling and pinches to the page", () => {
    remove = preventHistorySwipe()
    const list = document.createElement("div")
    document.body.append(list)

    expect(wheel(list, { deltaX: 3, deltaY: 80 }).defaultPrevented).toBe(false)
    expect(wheel(list, { deltaX: 40, deltaY: 0, ctrlKey: true }).defaultPrevented).toBe(false)
  })

  it("lets a strip scroll sideways while it has room, and stops the swipe at its edge", () => {
    remove = preventHistorySwipe()
    const strip = sidewaysScroller(100)
    const item = document.createElement("span")
    strip.append(item)

    expect(wheel(item, { deltaX: -40, deltaY: 0 }).defaultPrevented).toBe(false)
    expect(wheel(item, { deltaX: 40, deltaY: 0 }).defaultPrevented).toBe(false)

    strip.scrollLeft = 0
    // At its left edge a further swipe right would otherwise go back a page.
    expect(wheel(item, { deltaX: -40, deltaY: 0 }).defaultPrevented).toBe(true)
  })
})
