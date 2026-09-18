// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  ExportCancelledError,
  ExportRenderTimeoutError,
  exportPdf,
} from "../../../src/electron/exportPdf"
import { createExportSnapshot } from "../../../src/electron/exportSnapshot"

function snapshot() {
  return createExportSnapshot({
    format: "scourgify-export-snapshot-v1",
    title: "Printable report",
    revision: "d".repeat(64),
    markdown: "# Printable\n\nSelectable prose.",
    records: [],
    assets: [],
    bibliography: [],
    sources: [],
  })
}

describe("PDF export", () => {
  it("passes bounded inert HTML to the print adapter", async () => {
    // Given
    let receivedHtml = ""
    const renderer = {
      printToPdf: async (html: string) => {
        receivedHtml = html
        return new TextEncoder().encode("%PDF-1.7\nfixture")
      },
    }

    // When
    const file = await exportPdf(snapshot(), { renderer, timeoutMs: 1_000 })

    // Then
    expect(file.mediaType).toBe("application/pdf")
    expect(new TextDecoder().decode(file.bytes)).toContain("%PDF-1.7")
    expect(receivedHtml).toContain("default-src 'none'")
    expect(receivedHtml).toContain("Selectable prose")
  })

  it("fails recoverably when printing exceeds its bound", async () => {
    // Given
    const renderer = { printToPdf: async () => await new Promise<Uint8Array>(() => undefined) }

    // When
    const pending = exportPdf(snapshot(), { renderer, timeoutMs: 10 })

    // Then
    await expect(pending).rejects.toBeInstanceOf(ExportRenderTimeoutError)
  })

  it("cancels even when the print adapter has not completed", async () => {
    // Given
    const controller = new AbortController()
    const renderer = { printToPdf: async () => await new Promise<Uint8Array>(() => undefined) }

    // When
    const pending = exportPdf(snapshot(), { renderer, signal: controller.signal })
    controller.abort()

    // Then
    await expect(pending).rejects.toBeInstanceOf(ExportCancelledError)
  })
})
