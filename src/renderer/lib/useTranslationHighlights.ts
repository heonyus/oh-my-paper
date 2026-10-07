import { type RefObject, useEffect, useMemo } from "react"
import { useBoardHighlights } from "./boardHighlightsStore"
import type { PageTranslationBlock } from "./pageTranslationSource"
import { canonicalText, plainSource, quoteCoversText, textRangeIn } from "./translationTextMatch"

/** The registered name `::highlight()` styles in page-translation.css. */
export const translationHighlightName = "page-translation-highlight"

const rangesByPage = new Map<number, readonly Range[]>()

function highlightApi(): HighlightRegistry | null {
  return typeof Highlight === "function" && typeof CSS !== "undefined" && "highlights" in CSS
    ? CSS.highlights
    : null
}

function registerRanges(page: number, ranges: readonly Range[]): void {
  if (ranges.length === 0) rangesByPage.delete(page)
  else rangesByPage.set(page, ranges)
  const registry = highlightApi()
  if (!registry) return
  const all = [...rangesByPage.values()].flat()
  if (all.length === 0) registry.delete(translationHighlightName)
  else registry.set(translationHighlightName, new Highlight(...all))
}

function containers(article: HTMLElement): readonly HTMLElement[] {
  const columns = [
    ...article.querySelectorAll<HTMLElement>(".page-translation-source, .page-translation-result"),
  ]
  return columns.length > 0 ? columns : [article]
}

/**
 * Marks, in a translation pane's body, the sentences the board's highlights cover: each one's
 * translation and, where the pane shows it, its source. A sentence whose words cannot be
 * found as rendered (typeset math) marks its whole article instead.
 */
export function paintTranslationHighlights(
  body: HTMLElement,
  blocks: readonly PageTranslationBlock[],
  quotes: readonly string[],
): readonly Range[] {
  const covered = new Map(
    blocks
      .filter((block) => quotes.some((quote) => quoteCoversText(quote, plainSource(block.source))))
      .map((block) => [block.id, block]),
  )
  const ranges: Range[] = []
  for (const article of body.querySelectorAll<HTMLElement>("[data-block-ids]")) {
    const members = (article.getAttribute("data-block-ids") ?? "")
      .split(" ")
      .flatMap((id) => covered.get(id) ?? [])
    let unplaced = false
    for (const block of members) {
      let placed = false
      for (const container of containers(article)) {
        const text = container.matches(".page-translation-source")
          ? block.source
          : block.translation
        const range = textRangeIn(container, canonicalText(text))
        if (!range) continue
        ranges.push(range)
        placed = true
      }
      if (!placed) unplaced = true
    }
    if (unplaced || (members.length > 0 && !highlightApi()))
      article.setAttribute("data-highlighted", "true")
    else article.removeAttribute("data-highlighted")
  }
  return ranges
}

/** Echoes the board's highlights on this page's translation, following the pane as it re-renders. */
export function useTranslationHighlights(
  page: number,
  bodyRef: RefObject<HTMLElement | null>,
  blocks: readonly PageTranslationBlock[],
): void {
  const highlights = useBoardHighlights()
  const quotes = useMemo(
    () => highlights.filter((card) => card.anchor.page === page).map((card) => card.anchor.quote),
    [highlights, page],
  )
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    let frame: number | null = null
    const paint = (): void => {
      frame = null
      registerRanges(page, paintTranslationHighlights(body, blocks, quotes))
    }
    const schedule = (): void => {
      if (frame === null) frame = requestAnimationFrame(paint)
    }
    // Mode switches and streaming replace the rendered text, which the ranges follow.
    const observer = new MutationObserver(schedule)
    observer.observe(body, { childList: true, subtree: true, characterData: true })
    paint()
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      registerRanges(page, [])
    }
  }, [page, bodyRef, blocks, quotes])
}
