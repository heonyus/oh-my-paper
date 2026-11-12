import { type RefObject, useEffect, useRef } from "react"
import {
  litTextIsPainted,
  pageSourceBlockIdsAt,
  setLitText,
  setPageSourceActive,
} from "./pageTranslationSource"
import { canonicalText, textRangeIn } from "./translationTextMatch"

/** What the hover needs of a sentence: its id and how it reads on each side. */
type HoverBlock = {
  readonly id: string
  readonly source: string
  readonly translation: string
}

/** How long the pointer rests on a source block before its translation scrolls into view. */
const revealDelayMs = 250

function blockIds(article: HTMLElement): readonly string[] {
  return article.getAttribute("data-block-ids")?.split(" ").filter(Boolean) ?? []
}

/**
 * Scrolls only the translation body, never the board around it, so `article` sits in the
 * middle of the part of the body that is actually on screen.
 */
function revealWithin(container: HTMLElement, article: HTMLElement): void {
  const bounds = container.getBoundingClientRect()
  const board = container.closest(".board-viewport")?.getBoundingClientRect()
  const top = Math.max(bounds.top, board?.top ?? 0, 0)
  const bottom = Math.min(bounds.bottom, board?.bottom ?? window.innerHeight, window.innerHeight)
  if (bottom <= top) return
  const rect = article.getBoundingClientRect()
  if (rect.top >= top && rect.bottom <= bottom) return
  // The pane lives on the zoomed board, so screen pixels differ from scroll pixels.
  const scale = container.offsetHeight > 0 ? bounds.height / container.offsetHeight : 1
  const target =
    rect.height >= bottom - top ? top + 12 * scale : top + (bottom - top - rect.height) / 2
  container.scrollBy({ top: (rect.top - target) / (scale || 1), behavior: "smooth" })
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

/**
 * Where a sentence is written in a translation article: its translation and, in the modes that
 * show it, its source. Empty when its words cannot be found as rendered (typeset maths).
 */
function sentenceRanges(article: HTMLElement, block: HoverBlock): readonly Range[] {
  const columns = [
    ...article.querySelectorAll<HTMLElement>(".page-translation-source, .page-translation-result"),
  ]
  return (columns.length > 0 ? columns : [article]).flatMap((column) => {
    const text = column.matches(".page-translation-source") ? block.source : block.translation
    const key = canonicalText(text)
    const range = key ? textRangeIn(column, key) : null
    return range ? [withClosingPunctuation(range)] : []
  })
}

const closingPunctuation = /[.,;:!?)\]}”’"'%…。]/u

/** A sentence is found by its letters; the full stop after the last one is part of it too. */
function withClosingPunctuation(range: Range): Range {
  const node = range.endContainer
  if (!(node instanceof Text)) return range
  let end = range.endOffset
  while (end < node.data.length && closingPunctuation.test(node.data.charAt(end))) end += 1
  range.setEnd(node, end)
  return range
}

/** The text position under a point on screen, where the browser can say. */
function caretAt(point: { readonly x: number; readonly y: number }): {
  readonly node: Node
  readonly offset: number
} | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const caret = document.caretPositionFromPoint(point.x, point.y)
    return caret ? { node: caret.offsetNode, offset: caret.offset } : null
  }
  if (typeof document.caretRangeFromPoint === "function") {
    const caret = document.caretRangeFromPoint(point.x, point.y)
    return caret ? { node: caret.startContainer, offset: caret.startOffset } : null
  }
  return null
}

/**
 * Pairs each sentence of the page with its translation under the pointer. Hovering English
 * text on the PDF page lights that sentence there and its translation in this page's pane;
 * hovering a translated sentence lights it and its source. Where a sentence cannot be told
 * apart (its words are not found as rendered, or the browser cannot place the pointer in the
 * text), the whole translated paragraph and its source light up, as they used to.
 */
export function usePageSourceHover(
  pageNumber: number,
  bodyRef: RefObject<HTMLElement | null>,
  blocks: readonly HoverBlock[] = [],
): void {
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  useEffect(() => {
    const paneKey = `${pageNumber}:pane`
    let lastTarget: EventTarget | null = null
    let active: HTMLElement | null = null
    let lit: readonly string[] = []
    let revealTimer: number | null = null
    // The sentences of the article last looked at, kept while its text stays the same.
    let placed: {
      readonly article: HTMLElement
      readonly text: string
      readonly ranges: ReadonlyMap<string, readonly Range[]>
    } | null = null

    function rangesIn(article: HTMLElement): ReadonlyMap<string, readonly Range[]> {
      const text = article.textContent ?? ""
      if (placed?.article === article && placed.text === text) return placed.ranges
      const members = new Set(blockIds(article))
      const ranges = new Map<string, readonly Range[]>()
      for (const block of blocksRef.current) {
        if (!members.has(block.id)) continue
        const found = sentenceRanges(article, block)
        if (found.length > 0) ranges.set(block.id, found)
      }
      placed = { article, text, ranges }
      return ranges
    }

    /** The sentence of `article` the pointer is on, or every one when that cannot be told. */
    function sentencesAt(
      article: HTMLElement,
      point: { readonly x: number; readonly y: number },
    ): readonly string[] {
      const all = blockIds(article)
      if (all.length < 2 || !litTextIsPainted()) return all
      const caret = caretAt(point)
      if (!caret || !article.contains(caret.node)) return all
      for (const [id, ranges] of rangesIn(article))
        if (ranges.some((range) => range.isPointInRange(caret.node, caret.offset))) return [id]
      return all
    }

    function clearArticle(article: HTMLElement): void {
      article.removeAttribute("data-source-hover")
      article.removeAttribute("data-sentence-hover")
    }

    function activate(
      article: HTMLElement | null,
      ids: readonly string[],
      origin: "page" | "pane",
    ): void {
      const members = article ? blockIds(article) : []
      const sentences = ids.filter((id) => members.includes(id))
      if (article === active && sameIds(sentences, lit)) return
      for (const id of lit) setPageSourceActive(pageNumber, id, false)
      // The article lights its whole source when the pointer enters it; only the sentence stays.
      if (origin === "pane")
        for (const id of members)
          if (!sentences.includes(id)) setPageSourceActive(pageNumber, id, false)
      lit = sentences
      for (const id of lit) setPageSourceActive(pageNumber, id, true)

      if (article !== active) {
        if (revealTimer !== null) window.clearTimeout(revealTimer)
        revealTimer = null
        if (active) clearArticle(active)
        active = article
      }
      if (!article) {
        setLitText(paneKey, [])
        return
      }
      const ranges = rangesIn(article)
      const exact = litTextIsPainted() && lit.length > 0 && lit.every((id) => ranges.has(id))
      setLitText(paneKey, exact ? lit.flatMap((id) => ranges.get(id) ?? []) : [])
      // Its sentence painted, the article is not tinted whole as well.
      if (exact) article.setAttribute("data-sentence-hover", "")
      else article.removeAttribute("data-sentence-hover")
      if (origin === "page" && !exact) article.setAttribute("data-source-hover", "true")
      else article.removeAttribute("data-source-hover")
      if (origin === "page" && revealTimer === null)
        revealTimer = window.setTimeout(() => {
          revealTimer = null
          if (bodyRef.current && article.isConnected) revealWithin(bodyRef.current, article)
        }, revealDelayMs)
    }

    function onPointerMove(event: PointerEvent): void {
      const target = event.target
      const point = { x: event.clientX, y: event.clientY }
      const body = bodyRef.current
      const hovered =
        target instanceof Element && body?.contains(target)
          ? target.closest<HTMLElement>("[data-block-ids]")
          : null
      if (hovered) {
        lastTarget = target
        activate(hovered, sentencesAt(hovered, point), "pane")
        return
      }
      const span =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-page-translation-block]")
          : null
      // A span of one sentence always resolves to it; one shared by sentences, and a bound,
      // depend on where in it the pointer is.
      if (
        target === lastTarget &&
        span &&
        !span.getAttribute("data-page-translation-block")?.includes(",")
      )
        return
      lastTarget = target
      const ids = pageSourceBlockIdsAt(pageNumber, target, point)
      const article =
        ids.length > 0 && body
          ? ([...body.querySelectorAll<HTMLElement>("[data-block-ids]")].find((candidate) =>
              blockIds(candidate).some((id) => ids.includes(id)),
            ) ?? null)
          : null
      activate(article, ids, "page")
    }

    document.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onPointerMove)
      activate(null, [], "page")
    }
  }, [pageNumber, bodyRef])
}
