import { computeConnectedVisualBounds } from "./pdfFeatureDetection"

export type PdfFeatureKind = "figure" | "table" | "formula" | "section_heading"

export interface PdfOverlayFeature {
  readonly id: string
  readonly kind: PdfFeatureKind
  readonly pageIndex: number
  readonly label: string
  readonly caption?: string
  readonly boundingBox: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly confidence: number
  readonly source: "born_digital" | "layout_heuristic" | "ocr_fallback"
}

export interface PdfOverlayPageInput {
  readonly pageIndex: number
  readonly width: number
  readonly height: number
  readonly blocks: readonly {
    readonly id: string
    readonly text: string
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly fontName?: string
    readonly fontSize?: number
  }[]
  readonly graphics?: readonly {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }[]
}

export interface OverlayAnalysisResult {
  readonly pageIndex: number
  readonly features: readonly PdfOverlayFeature[]
  readonly status: "idle" | "analyzing" | "ready" | "error"
}

export function analyzePageForOverlays(page: PdfOverlayPageInput): readonly PdfOverlayFeature[] {
  const features: PdfOverlayFeature[] = []
  for (const block of page.blocks) {
    const text = block.text.trim()
    if (!text) continue
    const figure = /^(figure|fig\.?)\s+\d+/iu.test(text)
    const table = /^(table|tab\.?)\s+\d+/iu.test(text)
    const formula = /^\(\d+(\.\d+)?\)\s*$/u.test(text) || /^(equation|eq\.?)\s+\d+/iu.test(text)
    const heading =
      /^\d+(\.\d+)*\s+[A-Z]/u.test(text) ||
      /^(abstract|introduction|conclusion|references|methods|results|discussion)\b/iu.test(text)
    if (!figure && !table && !formula && !heading) continue

    let kind: PdfFeatureKind = "section_heading"
    let label = text
    let box = { x: block.x, y: block.y, width: block.width, height: block.height }
    let confidence = 0.9
    let source: PdfOverlayFeature["source"] = "born_digital"
    if (figure || table) {
      kind = figure ? "figure" : "table"
      label = (text.split(/[:.]/u)[0] ?? (figure ? "Figure" : "Table")).trim()
      const visual = computeConnectedVisualBounds(block, page.graphics ?? [], {
        searchDirection: figure ? "above" : "below",
        pageWidth: page.width,
        pageHeight: page.height,
      })
      if (visual) {
        box = visual
        confidence = 0.95
      } else {
        const top = figure ? Math.max(0, block.y - 200) : block.y + block.height + 4
        box = {
          x: block.x,
          y: top,
          width: block.width,
          height: figure ? Math.min(190, block.y) : Math.min(200, Math.max(20, page.height - top)),
        }
        source = "layout_heuristic"
        confidence = 0.7
      }
    } else if (formula) {
      kind = "formula"
      label = text.startsWith("(") ? `Eq. ${text}` : text
      box = {
        x: Math.max(0, block.x - 20),
        y: Math.max(0, block.y - 4),
        width: block.width + 40,
        height: block.height + 8,
      }
      source = "layout_heuristic"
      confidence = 0.85
    }
    if (text.includes("[ocr]")) {
      source = "ocr_fallback"
      confidence = 0.75
    }
    features.push({
      id: `feat-${page.pageIndex}-${features.length}`,
      kind,
      pageIndex: page.pageIndex,
      label,
      ...(figure || table ? { caption: text } : {}),
      boundingBox: box,
      confidence,
      source,
    })
  }
  return features
}

export function analyzeOverlayPageInput(page: PdfOverlayPageInput): OverlayAnalysisResult {
  return { pageIndex: page.pageIndex, features: analyzePageForOverlays(page), status: "ready" }
}
