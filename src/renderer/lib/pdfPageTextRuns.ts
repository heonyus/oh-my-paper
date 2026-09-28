import { type PDFPageProxy, Util } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PageFraction } from "./pageTranslationLayoutRegions"

/** A run of PDF text with where it sits on the page and how its font is set. */
export type PageTextRun = {
  readonly text: string
  readonly rect: PageFraction
  readonly bold: boolean
  readonly serif: boolean
}

type FontInfo = {
  readonly bold?: boolean
  readonly black?: boolean
  readonly name?: string
  readonly fallbackName?: string
}

/** Weight words in font names ("MinionPro-Bold", "Whitney-Semibold") or PDF.js's own flag. */
export function isBoldFont(font: FontInfo | null): boolean {
  if (!font) return false
  if (font.bold || font.black) return true
  return /(?:bold|black|heavy|semibold|demibold|demi)(?![a-z])|[-,.]bd?$/iu.test(font.name ?? "")
}

function fontOf(page: PDFPageProxy, fontName: string): FontInfo | null {
  try {
    return page.commonObjs.has(fontName) ? (page.commonObjs.get(fontName) as FontInfo) : null
  } catch {
    return null
  }
}

/**
 * The page's text runs in page fractions, with bold and serif read from the fonts that set
 * them. Loads the page's operator list first so its fonts are known.
 */
export async function pageTextRuns(page: PDFPageProxy): Promise<readonly PageTextRun[]> {
  await page.getOperatorList()
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  return content.items.flatMap((item): PageTextRun[] => {
    if (!("str" in item) || !item.str.trim()) return []
    const [, , c = 0, d = 0, x = 0, y = 0] = Util.transform(viewport.transform, item.transform)
    const height = Math.hypot(c, d)
    if (height <= 0 || viewport.width <= 0 || viewport.height <= 0) return []
    const font = fontOf(page, item.fontName)
    const family = font?.fallbackName ?? content.styles[item.fontName]?.fontFamily
    return [
      {
        text: item.str,
        rect: {
          x: x / viewport.width,
          y: (y - height) / viewport.height,
          width: (item.width * viewport.scale) / viewport.width,
          height: height / viewport.height,
        },
        bold: isBoldFont(font),
        serif: family === "serif",
      },
    ]
  })
}
