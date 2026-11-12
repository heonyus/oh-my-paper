import { afterEach, describe, expect, it, vi } from "vitest"
import { forwardWheel } from "../../src/renderer/components/InfographicFrame"

function frameInCard(): { frame: HTMLIFrameElement; scrollBy: ReturnType<typeof vi.fn> } {
  const body = document.createElement("div")
  body.className = "card-body"
  const scrollBy = vi.fn()
  Object.defineProperty(body, "scrollBy", { value: scrollBy })
  const frame = document.createElement("iframe")
  frame.getBoundingClientRect = () => new DOMRect(200, 100, 180, 90)
  Object.defineProperty(frame, "clientWidth", { value: 360 })
  Object.defineProperty(frame, "clientHeight", { value: 180 })
  body.append(frame)
  document.body.append(body)
  return { frame, scrollBy }
}

describe("a wheel inside an infographic's frame", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("reaches the board at the place on screen it happened", () => {
    const { frame, scrollBy } = frameInCard()
    const received: WheelEvent[] = []
    // The board's own listener sits on an ancestor of the card.
    frame.parentElement?.addEventListener("wheel", (event) => {
      received.push(event)
      event.preventDefault()
    })
    const inside = new WheelEvent("wheel", {
      deltaY: 40,
      clientX: 100,
      clientY: 60,
      ctrlKey: true,
      cancelable: true,
    })

    forwardWheel(frame, inside)

    expect(inside.defaultPrevented).toBe(true)
    expect(received).toHaveLength(1)
    expect(received[0]?.target).toBe(frame)
    // The board draws the frame at half size here.
    expect(received[0]).toMatchObject({ deltaY: 40, clientX: 250, clientY: 130, ctrlKey: true })
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it("scrolls the card's text when the board leaves the wheel to the card", () => {
    const { frame, scrollBy } = frameInCard()

    forwardWheel(frame, new WheelEvent("wheel", { deltaX: 3, deltaY: 40, cancelable: true }))

    expect(scrollBy).toHaveBeenCalledWith({ left: 3, top: 40, behavior: "instant" })
  })
})
