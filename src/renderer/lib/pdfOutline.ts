import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api"
import { detectPdfFeatures, type PdfTextSpan } from "./pdfFeatureDetection"
import { mergePdfTextLines } from "./pdfTextLines"

export type PdfOutlineEntry = { readonly title: string; readonly page: number }

export function outlineTitle(title: string): string | null {
  const cleaned = title.replace(/\s+해설$/u, "").trim()
  if (/https?:\/\//iu.test(cleaned) || /Reference Database|NDC to ATC/iu.test(cleaned)) return null
  if (
    /^(?:Abstract|Introduction|Background|Methods?|Methodology|Results|Discussion|Conclusion|References)$/iu.test(
      cleaned,
    )
  )
    return cleaned
  if (/^\d+(?:\.\d+)*\s+[A-Z][A-Za-z]/u.test(cleaned)) return cleaned
  if (/^[A-Z](?:\.\d+)*\s+[A-Z][A-Za-z]/u.test(cleaned)) return cleaned
  return null
}

function pageSpans(
  pageNumber: number,
  height: number,
  items: readonly (TextItem | TextMarkedContent)[],
): readonly PdfTextSpan[] {
  return items.flatMap((item, index) => {
    if (!("str" in item)) return []
    if (!item.str.trim()) return []
    const x = item.transform[4]
    const baseline = item.transform[5]
    const itemHeight = item.height || Math.abs(item.transform[3] ?? 0)
    if (x === undefined || baseline === undefined || item.width <= 0 || itemHeight <= 0) return []
    return [
      {
        id: `outline-${pageNumber}-${index}`,
        text: item.str,
        x,
        y: height - baseline - itemHeight,
        width: item.width,
        height: itemHeight,
        fontSize: Math.abs(item.transform[0] ?? itemHeight),
        fontWeight: 400,
      },
    ]
  })
}

export async function extractPdfOutline(
  pdf: PDFDocumentProxy,
): Promise<readonly PdfOutlineEntry[]> {
  const entries = new Map<string, PdfOutlineEntry>()
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const text = await page.getTextContent()
    const spans = mergePdfTextLines(
      pageSpans(pageNumber, viewport.height, text.items),
      viewport.width,
    )
    const structures = detectPdfFeatures({
      pageNumber,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      spans,
    })
    for (const structure of structures) {
      if (structure.kind !== "heading" && structure.kind !== "subheading") continue
      const title = outlineTitle(structure.label)
      if (title) entries.set(`${pageNumber}:${title}`, { title, page: pageNumber })
    }
  }
  return [...entries.values()].sort((left, right) => left.page - right.page)
}
