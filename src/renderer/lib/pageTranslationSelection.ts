import {
  type BoardTextSelection,
  captureBoardTextSelectionRects,
  screenRect,
  worldFragments,
} from "./boardSelection"
import type { PageTranslationBlock } from "./pageTranslationSource"
import { sourceElementMatchesBlock } from "./pageTranslationSpanMapping"
import {
  anchoredRangeOfOwners,
  canonicalText,
  coveredBlocks,
  plainSource,
  rangeOfOwners,
  textOwners,
  textWithin,
} from "./translationTextMatch"

type TranslationSelectionInput = {
  readonly paneElement: HTMLElement
  readonly pageElement: HTMLElement
  readonly boardWorldElement: HTMLElement
  readonly range: Range
  readonly blocks: readonly PageTranslationBlock[]
}

function blockIds(element: Element): readonly string[] {
  return element.getAttribute("data-block-ids")?.split(" ").filter(Boolean) ?? []
}

/** The translation units a selection in the pane covers, in the page's order. */
export function selectedTranslationBlocks(
  paneElement: HTMLElement,
  range: Range,
  blocks: readonly PageTranslationBlock[],
): readonly PageTranslationBlock[] {
  const byId = new Map(blocks.map((block) => [block.id, block]))
  const selected = new Set<string>()
  for (const article of paneElement.querySelectorAll<HTMLElement>("[data-block-ids]")) {
    if (!range.intersectsNode(article)) continue
    const members = blockIds(article).flatMap((id) => {
      const block = byId.get(id)
      return block ? [block] : []
    })
    for (const block of coveredBlocks(members, textWithin(range, article))) selected.add(block.id)
  }
  return blocks.filter((block) => selected.has(block.id))
}

function sourceSpans(pageElement: HTMLElement, ids: readonly string[]): readonly HTMLElement[] {
  return [
    ...pageElement.querySelectorAll<HTMLElement>(".textLayer [data-page-translation-block]"),
  ].filter((span) => ids.some((id) => sourceElementMatchesBlock(span, id)))
}

function sourceBoundRects(pageNumber: string | null, ids: readonly string[]): readonly DOMRect[] {
  const overlay = document.querySelector<HTMLElement>(
    `.paper-structure-host > [data-page-number="${pageNumber ?? ""}"]`,
  )
  return [...(overlay?.querySelectorAll<HTMLElement>(".page-translation-source-bound") ?? [])]
    .filter((bound) => ids.some((id) => sourceElementMatchesBlock(bound, id)))
    .map((bound) => bound.getBoundingClientRect())
}

function inside(rect: DOMRect, boxes: readonly DOMRect[], padding: number): boolean {
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  return boxes.some(
    (box) =>
      x >= box.left - padding &&
      x <= box.right + padding &&
      y >= box.top - padding &&
      y <= box.bottom + padding,
  )
}

/**
 * The text-layer spans a block's source may be written in: those mapped to it, else those
 * lying in the box drawn for it when no span could be mapped, else the whole page's.
 */
function candidateSpans(
  pageElement: HTMLElement,
  pageNumber: string | null,
  block: PageTranslationBlock,
): readonly HTMLElement[] {
  const mapped = sourceSpans(pageElement, [block.id])
  if (mapped.length > 0) return mapped
  const all = [...pageElement.querySelectorAll<HTMLElement>(".textLayer span")]
  const boxes = sourceBoundRects(pageNumber, [block.id])
  if (boxes.length === 0) return all
  const padding = Math.max(2, pageElement.getBoundingClientRect().width * 0.005)
  return all.filter((span) => inside(span.getBoundingClientRect(), boxes, padding))
}

/**
 * Where the source of `blocks` is printed on the page: the exact letters when the text layer
 * spells them, else the lines from a sentence's opening letters to its closing ones, else
 * the boxes drawn for it.
 */
export function sourceClientRects(
  pageElement: HTMLElement,
  blocks: readonly PageTranslationBlock[],
): readonly DOMRect[] {
  const pageNumber = pageElement.getAttribute("data-page-number")
  const ids = blocks.map((block) => block.id)
  const whole = rangeOfOwners(
    textOwners(sourceSpans(pageElement, ids)),
    blocks.map((block) => canonicalText(block.source)).join(""),
  )
  if (whole) return [...whole.getClientRects()]
  return blocks.flatMap((block) => {
    const owners = textOwners(candidateSpans(pageElement, pageNumber, block))
    const range = anchoredRangeOfOwners(owners, canonicalText(block.source))
    if (range) return [...range.getClientRects()]
    return sourceBoundRects(pageNumber, [block.id])
  })
}

/**
 * A selection made in a page's translation pane, read back to the source sentences it
 * covers: the selection's quote and fragments are theirs on the page, and the toolbar is
 * anchored by the translated words the reader actually selected.
 */
export function captureTranslationSelection(
  input: TranslationSelectionInput,
): BoardTextSelection | null {
  const blocks = selectedTranslationBlocks(input.paneElement, input.range, input.blocks)
  if (blocks.length === 0) return null
  const quote = blocks.map((block) => plainSource(block.source)).join(" ")
  const selection = captureBoardTextSelectionRects({
    pageElement: input.pageElement,
    boardWorldElement: input.boardWorldElement,
    quote,
    rects: sourceClientRects(input.pageElement, blocks).map(screenRect),
  })
  if (!selection) return null
  const selectedRect = input.range.getClientRects()[0]
  const anchor = selectedRect
    ? worldFragments(input.boardWorldElement, [screenRect(selectedRect)])[0]
    : undefined
  const first = selection.fragments[0]
  if (!first) return null
  return {
    ...selection,
    viaTranslation: { text: input.range.toString().trim(), anchor: anchor ?? first },
  }
}
