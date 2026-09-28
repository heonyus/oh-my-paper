import {
  normalizeParsedDocumentPage,
  type ParsedDocumentPage,
  type ParsedPageBlock,
} from "../shared/documentPageModel"

const structuralLabels: ReadonlySet<ParsedPageBlock["label"]> = new Set([
  "image",
  "table",
  "chart",
  "equation",
])

/** Paddle reads headings from the page image, so they win over PDF.js font-free guesses. */
const headingLabels: ReadonlySet<ParsedPageBlock["label"]> = new Set([
  "doc_title",
  "paragraph_title",
])

function scaleBlock(
  block: ParsedPageBlock,
  scale: { readonly x: number; readonly y: number },
): ParsedPageBlock {
  return {
    ...block,
    bounds: {
      x: block.bounds.x * scale.x,
      y: block.bounds.y * scale.y,
      width: block.bounds.width * scale.x,
      height: block.bounds.height * scale.y,
    },
  }
}

function containsCenter(container: ParsedPageBlock, candidate: ParsedPageBlock): boolean {
  const centerX = candidate.bounds.x + candidate.bounds.width / 2
  const centerY = candidate.bounds.y + candidate.bounds.height / 2
  return (
    centerX >= container.bounds.x &&
    centerX <= container.bounds.x + container.bounds.width &&
    centerY >= container.bounds.y &&
    centerY <= container.bounds.y + container.bounds.height
  )
}

function overlapsHorizontally(left: ParsedPageBlock, right: ParsedPageBlock): boolean {
  return (
    left.bounds.x < right.bounds.x + right.bounds.width &&
    right.bounds.x < left.bounds.x + left.bounds.width
  )
}

function overlaps(left: ParsedPageBlock, right: ParsedPageBlock): boolean {
  return (
    overlapsHorizontally(left, right) &&
    left.bounds.y < right.bounds.y + right.bounds.height &&
    right.bounds.y < left.bounds.y + left.bounds.height
  )
}

function headingText(heading: ParsedPageBlock): string {
  return heading.content.replace(/^#{1,6}\s+/u, "").trim()
}

/** Removes `affix` from one end of `content`, ignoring whitespace differences. */
function withoutAffix(content: string, affix: string, side: "start" | "end"): string | null {
  const wanted = [...affix.replace(/\s+/gu, "")]
  if (wanted.length === 0) return null
  const characters = [...content]
  if (side === "end") {
    characters.reverse()
    wanted.reverse()
  }
  let matched = 0
  let index = 0
  for (; index < characters.length && matched < wanted.length; index += 1) {
    const character = characters[index] ?? ""
    if (/\s/u.test(character)) continue
    if (character !== wanted[matched]) return null
    matched += 1
  }
  if (matched < wanted.length) return null
  const rest = characters.slice(index)
  if (side === "end") rest.reverse()
  return rest.join("").trim()
}

type HeadingCut = {
  readonly block: ParsedPageBlock | null
  readonly heading: "before" | "after" | null
}

/**
 * PDF.js often glues a heading to the line after (or before) it. Cuts the heading's text
 * and area out of such a line and says on which side of it the heading belongs.
 */
function cutHeading(block: ParsedPageBlock, heading: ParsedPageBlock): HeadingCut {
  const text = headingText(heading)
  const bottom = block.bounds.y + block.bounds.height
  const after = withoutAffix(block.content, text, "start")
  if (after !== null) {
    const y = Math.max(block.bounds.y, heading.bounds.y + heading.bounds.height)
    return {
      block: after
        ? {
            ...block,
            content: after,
            bounds: { ...block.bounds, y, height: Math.max(1, bottom - y) },
          }
        : null,
      heading: "before",
    }
  }
  const before = withoutAffix(block.content, text, "end")
  if (before === null) return { block, heading: null }
  const height = Math.max(1, Math.min(bottom, heading.bounds.y) - block.bounds.y)
  return {
    block: before ? { ...block, content: before, bounds: { ...block.bounds, height } } : null,
    heading: "after",
  }
}

/**
 * Drops PDF.js lines that sit inside a Paddle region, demotes PDF.js heading guesses to
 * text, and puts each Paddle heading where the PDF.js lines it replaces were read.
 */
function nativeWithHeadings(
  nativeBlocks: readonly ParsedPageBlock[],
  structures: readonly ParsedPageBlock[],
  headings: readonly ParsedPageBlock[],
): { readonly blocks: readonly ParsedPageBlock[]; readonly unplaced: readonly ParsedPageBlock[] } {
  const placed = new Set<ParsedPageBlock>()
  const place = (heading: ParsedPageBlock): ParsedPageBlock[] => {
    if (placed.has(heading)) return []
    placed.add(heading)
    return [heading]
  }
  const blocks = nativeBlocks.flatMap((block): ParsedPageBlock[] => {
    if (structures.some((structure) => containsCenter(structure, block))) return []
    const covering = headings.find((heading) => containsCenter(heading, block))
    if (covering) return place(covering)
    const before: ParsedPageBlock[] = []
    const after: ParsedPageBlock[] = []
    let retained: ParsedPageBlock | null = headingLabels.has(block.label)
      ? { ...block, label: "text" }
      : block
    for (const heading of headings) {
      if (!retained || !overlaps(retained, heading)) continue
      const cut = cutHeading(retained, heading)
      retained = cut.block
      if (cut.heading === "before") before.push(...place(heading))
      if (cut.heading === "after") after.unshift(...place(heading))
    }
    return [...before, ...(retained ? [retained] : []), ...after]
  })
  return { blocks, unplaced: headings.filter((heading) => !placed.has(heading)) }
}

function equationNumber(
  equation: ParsedPageBlock,
  candidates: readonly ParsedPageBlock[],
  pageWidth: number,
): ParsedPageBlock | null {
  const right = equation.bounds.x + equation.bounds.width
  const middleY = equation.bounds.y + equation.bounds.height / 2
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.label === "unknown" &&
          /^\([0-9]+\)$/u.test(candidate.content.trim()) &&
          candidate.bounds.x >= right &&
          candidate.bounds.x - right <= pageWidth * 0.25 &&
          Math.abs(candidate.bounds.y + candidate.bounds.height / 2 - middleY) <=
            equation.bounds.height,
      )
      .sort((left, rightCandidate) => left.bounds.x - rightCandidate.bounds.x)[0] ?? null
  )
}

function withEquationNumber(
  block: ParsedPageBlock,
  paddleBlocks: readonly ParsedPageBlock[],
  pageWidth: number,
): ParsedPageBlock {
  if (block.label !== "equation") return block
  const number = equationNumber(block, paddleBlocks, pageWidth)
  if (!number) return block
  const right = Math.max(block.bounds.x + block.bounds.width, number.bounds.x + number.bounds.width)
  const bottom = Math.max(
    block.bounds.y + block.bounds.height,
    number.bounds.y + number.bounds.height,
  )
  return {
    ...block,
    bounds: {
      x: block.bounds.x,
      y: block.bounds.y,
      width: right - block.bounds.x,
      height: bottom - block.bounds.y,
    },
    content: `${block.content.trim()} ${number.content.trim()}`,
  }
}

function insertStructuralBlocks(
  nativeBlocks: readonly ParsedPageBlock[],
  structuralBlocks: readonly ParsedPageBlock[],
): readonly ParsedPageBlock[] {
  const merged = [...nativeBlocks]
  const orderedStructures = [...structuralBlocks].sort(
    (left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x,
  )
  for (const structure of orderedStructures) {
    const bottom = structure.bounds.y + structure.bounds.height
    const index = merged.findIndex((block) => block.bounds.y >= bottom)
    if (index < 0) merged.push(structure)
    else merged.splice(index, 0, structure)
  }
  return merged
}

/** Places a heading PDF.js never read before the first following block of its column. */
function insertHeadings(
  blocks: readonly ParsedPageBlock[],
  headings: readonly ParsedPageBlock[],
): readonly ParsedPageBlock[] {
  let merged = [...blocks]
  for (const heading of headings) {
    const middle = heading.bounds.y + heading.bounds.height / 2
    const index = merged.findIndex(
      (block) => block.bounds.y >= middle && overlapsHorizontally(block, heading),
    )
    if (index >= 0) merged.splice(index, 0, heading)
    else merged = [...insertStructuralBlocks(merged, [heading])]
  }
  return merged
}

export function mergePdfJsAndPaddlePage(
  nativePage: ParsedDocumentPage,
  paddlePage: ParsedDocumentPage,
): ParsedDocumentPage {
  const scale = {
    x: paddlePage.width / nativePage.width,
    y: paddlePage.height / nativePage.height,
  }
  const nativeBlocks = nativePage.blocks.map((block) => scaleBlock(block, scale))
  const structures = paddlePage.blocks
    .filter((block) => structuralLabels.has(block.label))
    .map((block) => withEquationNumber(block, paddlePage.blocks, paddlePage.width))
  const headings = paddlePage.blocks
    .filter((block) => headingLabels.has(block.label) && headingText(block))
    .sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x)
  const native = nativeWithHeadings(nativeBlocks, structures, headings)
  const withStructures = insertStructuralBlocks(native.blocks, structures)
  const merged = insertHeadings(withStructures, native.unplaced).map((block, order) => ({
    ...block,
    id: `page:${nativePage.pageNumber}:block:${order}`,
    order,
  }))
  return normalizeParsedDocumentPage({
    schemaVersion: "1.0.0",
    sourceHash: nativePage.sourceHash,
    parser: "PDF.js+PaddleOCR-VL-1.6",
    configVersion: "hybrid-v10",
    pageNumber: nativePage.pageNumber,
    width: paddlePage.width,
    height: paddlePage.height,
    blocks: merged,
  })
}
