import {
  type BoardTextSelection,
  captureBoardTextSelectionRects,
  screenRect,
  worldFragments,
} from "./boardSelection"
import type { PageTranslationBlock } from "./pageTranslationSource"
import { sourceElementMatchesBlock } from "./pageTranslationSpanMapping"
import {
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

/**
 * Where the source of `blocks` is printed on the page: the exact letters when the text layer
 * spells them, else the lines of the spans mapped to them, else the boxes drawn for them.
 */
export function sourceClientRects(
  pageElement: HTMLElement,
  blocks: readonly PageTranslationBlock[],
): readonly DOMRect[] {
  const ids = blocks.map((block) => block.id)
  const spans = sourceSpans(pageElement, ids)
  const owners = textOwners(spans)
  const whole = rangeOfOwners(owners, blocks.map((block) => canonicalText(block.source)).join(""))
  if (whole) return [...whole.getClientRects()]
  const rects = blocks.flatMap((block) => {
    const range = rangeOfOwners(owners, canonicalText(block.source))
    if (range) return [...range.getClientRects()]
    const mapped = sourceSpans(pageElement, [block.id])
    if (mapped.length > 0) return mapped.map((span) => span.getBoundingClientRect())
    return sourceBoundRects(pageElement.getAttribute("data-page-number"), [block.id])
  })
  return rects
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
