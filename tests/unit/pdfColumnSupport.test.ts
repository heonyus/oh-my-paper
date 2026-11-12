import { describe, expect, it, vi } from "vitest"
import {
  bindPdfExternalLinks,
  firstPageDrawn,
  urlFromPdfClickTarget,
} from "../../src/renderer/lib/pdfColumnSupport"

describe("PDF column links", () => {
  it("reads an HTTPS URL from a PDF.js annotation anchor", () => {
    const anchor = document.createElement("a")
    anchor.href = "https://openreview.net/forum?id=lpFFpTbi9s"

    expect(urlFromPdfClickTarget(anchor)).toBe("https://openreview.net/forum?id=lpFFpTbi9s")
  })

  it("falls back to visible URL text and rejects internal PDF destinations", () => {
    const span = document.createElement("span")
    span.className = "pdf-link-text"
    span.textContent = "URL https://arxiv.org/abs/2501.04227."
    const internal = document.createElement("a")
    internal.href = "file:///Applications/oh-my-paper.app/index.html#figure.caption.1"

    expect(urlFromPdfClickTarget(span)).toBe("https://arxiv.org/abs/2501.04227")
    expect(urlFromPdfClickTarget(internal)).toBeNull()
  })

  it("does not resolve a page URL when a non-link figure surface is clicked", () => {
    // Given
    const page = document.createElement("div")
    page.className = "page"
    const figureSurface = document.createElement("div")
    figureSurface.className = "canvasWrapper"
    const unrelatedLinkText = document.createElement("span")
    unrelatedLinkText.textContent = "Repository https://example.com/unrelated"
    page.append(figureSurface, unrelatedLinkText)

    // When
    const result = urlFromPdfClickTarget(page)

    // Then
    expect(result).toBeNull()
  })

  it("opens an HTTPS PDF link through the registered Electron boundary", () => {
    const container = document.createElement("div")
    const anchor = document.createElement("a")
    anchor.href = "https://example.com/paper"
    container.append(anchor)
    const openExternal = vi.fn(async () => undefined)
    const release = bindPdfExternalLinks(container, openExternal)

    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(openExternal).toHaveBeenCalledWith({ url: "https://example.com/paper" })
    release()
  })
})

describe("first page drawn", () => {
  function fakeBus() {
    const listeners = new Set<() => void>()
    return {
      listeners,
      on: (_name: string, listener: () => void) => void listeners.add(listener),
      off: (_name: string, listener: () => void) => void listeners.delete(listener),
      render: () => {
        for (const listener of [...listeners]) listener()
      },
    }
  }

  it("resolves when PDF.js draws a page and stops listening", async () => {
    const bus = fakeBus()
    const settled = vi.fn()
    const drawn = firstPageDrawn(bus).then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()

    bus.render()
    await drawn
    expect(settled).toHaveBeenCalledOnce()
    expect(bus.listeners.size).toBe(0)
  })

  it("resolves after the grace period when no page is drawn", async () => {
    vi.useFakeTimers()
    try {
      const bus = fakeBus()
      const settled = vi.fn()
      const drawn = firstPageDrawn(bus, undefined, 500).then(settled)
      await vi.advanceTimersByTimeAsync(499)
      expect(settled).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await drawn
      expect(bus.listeners.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("resolves at once when the paper is closed", async () => {
    const bus = fakeBus()
    const closing = new AbortController()
    const drawn = firstPageDrawn(bus, closing.signal)
    closing.abort()
    await drawn
    expect(bus.listeners.size).toBe(0)

    await firstPageDrawn(bus, closing.signal)
    expect(bus.listeners.size).toBe(0)
  })
})
