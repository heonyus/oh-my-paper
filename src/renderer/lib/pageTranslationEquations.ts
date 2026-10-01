import katex from "katex"
import type { ParsedDocumentPage, ParsedPageBlock } from "../../shared/documentPageModel"
import type { LayoutRegion, PageFraction } from "./pageTranslationLayoutRegions"
import type { PageTranslationBlock } from "./pageTranslationSource"

/** Layout boxes of running text: a formula centred inside one is inline, not displayed. */
const textLabels = new Set<ParsedPageBlock["label"]>([
  "text",
  "list",
  "references",
  "footnote",
  "aside_text",
  "figure_title",
  "table_title",
])
const displayMath = /^\s*(?:\$\$([\s\S]*)\$\$|\\\[([\s\S]*)\\\])\s*$/u
/** The equation number the parser joined to its equation: "… (3)". */
const trailingNumber = /\s*\((\d{1,3}[a-z]?)\)\s*$/u

type Bounds = ParsedPageBlock["bounds"]

function centreInside(inner: Bounds, outer: Bounds): boolean {
  const x = inner.x + inner.width / 2
  const y = inner.y + inner.height / 2
  return x >= outer.x && x <= outer.x + outer.width && y >= outer.y && y <= outer.y + outer.height
}

/**
 * The LaTeX of a display equation the layout model read, its number set as a `\tag`, or null
 * when the block holds no display math or KaTeX cannot typeset it.
 */
export function equationLatex(source: string): string | null {
  const match = displayMath.exec(source)
  const body = (match?.[1] ?? match?.[2])?.trim()
  if (!body) return null
  const number = body.includes("\\tag") ? null : trailingNumber.exec(body)
  const latex = number ? `${body.slice(0, number.index).trim()} \\tag{${number[1]}}` : body
  try {
    katex.renderToString(latex, { displayMode: true, throwOnError: true, strict: "ignore" })
    return latex
  } catch {
    return null
  }
}

function pageFraction(bounds: Bounds, block: PageTranslationBlock): PageFraction | null {
  const width = block.sourcePageWidth
  const height = block.sourcePageHeight
  if (!width || !height || bounds.width <= 0 || bounds.height <= 0) return null
  return {
    x: bounds.x / width,
    y: bounds.y / height,
    width: bounds.width / width,
    height: bounds.height / height,
  }
}

function overlapsHorizontally(left: Bounds, right: Bounds): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width
}

/**
 * The equation's box widened, about its centre, to the text column it is set in: the nearest
 * paragraphs above and below it. KaTeX may set a formula wider than the source's typesetter,
 * and the column's free space keeps it near the size of the text around it.
 */
function widenedToColumn(box: Bounds, text: readonly { readonly bounds: Bounds }[]): Bounds {
  const column = text
    .map((paragraph) => paragraph.bounds)
    .filter((b) => overlapsHorizontally(b, box))
  const bottom = box.y + box.height
  const above = column
    .filter((b) => b.y + b.height <= box.y + box.height / 2)
    .sort((a, b) => b.y + b.height - (a.y + a.height))[0]
  const below = column.filter((b) => b.y >= bottom - box.height / 2).sort((a, b) => a.y - b.y)[0]
  const edges = [above, below].filter((b): b is Bounds => b !== undefined)
  if (edges.length === 0) return box
  const left = Math.min(...edges.map((b) => b.x))
  const right = Math.max(...edges.map((b) => b.x + b.width))
  const centre = box.x + box.width / 2
  const half = Math.max(box.width / 2, Math.min(centre - left, right - centre))
  return { x: centre - half, y: box.y, width: half * 2, height: box.height }
}

/**
 * Display equations typeset from the LaTeX the layout model read, each in its source box,
 * so they read as sharply as the translation around them. Formulas inside running text and
 * LaTeX KaTeX cannot typeset keep the source's own pixels.
 */
export function equationRegions(
  blocks: readonly PageTranslationBlock[],
  page: ParsedDocumentPage | null,
): readonly LayoutRegion[] {
  const text = (page?.layout ?? page?.blocks ?? []).filter((block) => textLabels.has(block.label))
  return blocks.flatMap((block): LayoutRegion[] => {
    if (block.structureKind !== "equation" || !block.sourceBounds) return []
    const { sourceBounds } = block
    if (text.some((paragraph) => centreInside(sourceBounds, paragraph.bounds))) return []
    const latex = equationLatex(block.source)
    const rect = pageFraction(widenedToColumn(sourceBounds, text), block)
    const mask = pageFraction(sourceBounds, block)
    if (!latex || !rect || !mask) return []
    return [
      {
        id: `equation:${block.id}`,
        blockIds: [block.id],
        kind: "equation",
        rect,
        translation: `$$\n${latex}\n$$`,
        mask,
      },
    ]
  })
}
