import { describe, expect, it } from "vitest"
import { urlFromPdfClickTarget } from "../../src/renderer/lib/pdfColumnSupport"

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
    internal.href = "file:///Applications/Scourgify.app/index.html#figure.caption.1"

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
})
