import { type PDFPageProxy, Util } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PageFraction } from "./pageTranslationLayoutRegions"

/** A run of PDF text with where it sits on the page and how its font is set. */
export type PageTextRun = {
  readonly text: string
  readonly rect: PageFraction
  readonly bold: boolean
  readonly serif: boolean
  readonly italic: boolean
}

type FontInfo = {
  readonly bold?: boolean
  readonly black?: boolean
  readonly italic?: boolean
  readonly name?: string
  readonly fallbackName?: string
}

/**
 * Weight words in font names ("MinionPro-Bold", "Whitney-Semibold", URW's
 * "NimbusRomNo9L-Medi"), LaTeX's bold extended faces (CMBX10, SFBX1200), or PDF.js's own
 * flag.
 */
export function isBoldFont(font: FontInfo | null): boolean {
  if (!font) return false
  if (font.bold || font.black) return true
  const name = (font.name ?? "").replace(/^[A-Z]{6}\+/u, "")
  return (
    /(?:bold|black|heavy|semibold|demibold|demi)(?![a-z])|[-,.]bd?$|-medi(?:ita)?$/iu.test(name) ||
    /^(?:cmbx|cmb\d|cmssbx|sfbx|sfsx|lmbx)/iu.test(name)
  )
}

/** Slant words in font names ("Times-Italic", LaTeX's CMTI10) or PDF.js's own flag. */
export function isItalicFont(font: FontInfo | null): boolean {
  if (!font) return false
  if (font.italic) return true
  const name = (font.name ?? "").replace(/^[A-Z]{6}\+/u, "")
  return /italic|oblique|^(?:cmti|cmsl|cmbxti|sfti|sfsl)\d|[-,](?:it|bdit|boldit)$/iu.test(name)
}

const serifNames =
  /^(?:cm(?:r|b|bx|ti|sl|mi|csc|u)\d|sfrm|sfbx|sfti|lmroman|times|tex-gyre-(?:termes|pagella|schola|bonum)|minion|nimbusrom|georgia|garamond|palatino|cambria|stix|charter|utopia|baskerville|caslon|mercury|merriweather|source ?serif|noto ?serif|libertine|linux ?libertine|computer ?modern)/iu
const sansNames =
  /^(?:cmss|sfss|lmsans|helvetica|arial|whitney|calibri|verdana|univers|frutiger|myriad|gill|futura|avenir|roboto|open ?sans|source ?sans|noto ?sans|dejavu ?sans|segoe)/iu

/**
 * Whether a font is a serif face. The font's own name decides first — PDF.js files LaTeX's
 * Computer Modern (CMR10) under sans-serif — and PDF.js's fallback family otherwise.
 */
export function isSerifFont(font: FontInfo | null, fallbackFamily?: string): boolean {
  const name = (font?.name ?? "").replace(/^[A-Z]{6}\+/u, "")
  if (sansNames.test(name)) return false
  if (serifNames.test(name)) return true
  return (font?.fallbackName ?? fallbackFamily) === "serif"
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
        serif: isSerifFont(font, content.styles[item.fontName]?.fontFamily),
        italic: isItalicFont(font),
      },
    ]
  })
}
