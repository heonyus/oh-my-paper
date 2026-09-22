import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import { describe, expect, it } from "vitest"
import { extractPdfOutline } from "../../src/renderer/lib/pdfOutline"

function headingItem(text: string, baseline: number) {
  return { str: text, transform: [12, 0, 0, 12, 50, baseline], width: 120, height: 12 }
}

function fakePdf(
  headings: Readonly<Record<number, readonly string[]>>,
  onPageRead?: () => Promise<void>,
): PDFDocumentProxy {
  const numPages = Math.max(...Object.keys(headings).map(Number), 0)
  return {
    numPages,
    getPage: async (pageNumber: number) => ({
      getViewport: () => ({ width: 600, height: 800 }),
      getTextContent: async () => {
        await onPageRead?.()
        return {
          items: (headings[pageNumber] ?? []).map((text, index) =>
            headingItem(text, 700 + index * 40),
          ),
        }
      },
    }),
  } as unknown as PDFDocumentProxy
}

describe("extractPdfOutline", () => {
  it("keeps page ordering while reading pages with bounded parallelism", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const entries = await extractPdfOutline(
      fakePdf(
        {
          1: ["1 Introduction"],
          2: ["2 Methods"],
          5: ["3 Results"],
          8: ["4 Discussion"],
          9: ["References"],
        },
        async () => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 1))
          inFlight -= 1
        },
      ),
    )

    expect(entries.map((entry) => entry.page)).toEqual([1, 2, 5, 8, 9])
    expect(entries.map((entry) => entry.title)).toEqual([
      "1 Introduction",
      "2 Methods",
      "3 Results",
      "4 Discussion",
      "References",
    ])
    expect(maxInFlight).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(4)
  })

  it("de-duplicates repeated headings on the same page", async () => {
    const entries = await extractPdfOutline(
      fakePdf({ 3: ["3 Results", "3 Results", "Body text stays ignored."] }),
    )

    expect(entries).toEqual([{ title: "3 Results", page: 3 }])
  })
})
