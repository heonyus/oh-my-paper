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
  const retainedNative = nativeBlocks.filter(
    (block) => !structures.some((structure) => containsCenter(structure, block)),
  )
  const merged = insertStructuralBlocks(retainedNative, structures).map((block, order) => ({
    ...block,
    id: `page:${nativePage.pageNumber}:block:${order}`,
    order,
  }))
  return normalizeParsedDocumentPage({
    schemaVersion: "1.0.0",
    sourceHash: nativePage.sourceHash,
    parser: "PDF.js+PaddleOCR-VL-1.6",
    configVersion: "hybrid-v9",
    pageNumber: nativePage.pageNumber,
    width: paddlePage.width,
    height: paddlePage.height,
    blocks: merged,
  })
}
