import { type RefObject, useEffect } from "react"
import { pageSourceBlockIdsAt, setPageSourceActive } from "./pageTranslationSource"

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

/**
 * Hovering English text on the PDF page lights up that source block and its translation
 * in this page's pane — the reverse of hovering a translation block.
 */
export function usePageSourceHover(
  pageNumber: number,
  bodyRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    let lastTarget: EventTarget | null = null
    let active: HTMLElement | null = null
    let revealTimer: number | null = null

    function activate(article: HTMLElement | null): void {
      if (article === active) return
      if (revealTimer !== null) window.clearTimeout(revealTimer)
      revealTimer = null
      if (active) {
        active.removeAttribute("data-source-hover")
        // Moving straight onto the same translation keeps the highlight it sets itself.
        if (!active.matches(":hover"))
          for (const id of blockIds(active)) setPageSourceActive(pageNumber, id, false)
      }
      active = article
      if (!article) return
      article.setAttribute("data-source-hover", "true")
      for (const id of blockIds(article)) setPageSourceActive(pageNumber, id, true)
      revealTimer = window.setTimeout(() => {
        revealTimer = null
        if (bodyRef.current && article.isConnected) revealWithin(bodyRef.current, article)
      }, revealDelayMs)
    }

    function onPointerMove(event: PointerEvent): void {
      const target = event.target
      // A mapped span always resolves to the same blocks; bounds need a fresh hit-test.
      if (
        target === lastTarget &&
        target instanceof Element &&
        target.closest("[data-page-translation-block]")
      )
        return
      lastTarget = target
      const ids = pageSourceBlockIdsAt(pageNumber, target, {
        x: event.clientX,
        y: event.clientY,
      })
      const body = bodyRef.current
      const article =
        ids.length > 0 && body
          ? ([...body.querySelectorAll<HTMLElement>("[data-block-ids]")].find((candidate) =>
              blockIds(candidate).some((id) => ids.includes(id)),
            ) ?? null)
          : null
      activate(article)
    }

    document.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onPointerMove)
      activate(null)
    }
  }, [pageNumber, bodyRef])
}
