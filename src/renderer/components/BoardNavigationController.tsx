import { type JSX, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { CARD_WIDTH, initialResearchCardHeight, MINIMIZED_CARD_HEIGHT } from "../lib/board"
import {
  centerViewportOnWorldPoint,
  constrainViewportToBounds,
  symmetricBoardBounds,
  type ViewportSize,
  type WorldRect,
} from "../lib/boardNavigation"
import type { BoardCard, Viewport } from "../types"
import { BoardMinimap } from "./BoardMinimap"
import { PAPER_ORIGIN } from "./PdfSurface"

const navigationPadding = 40
const minimumBoardSideSpace = 720

type BoardNavigationControllerProps = {
  readonly viewport: Viewport
  readonly cards: readonly BoardCard[]
  readonly currentPage: number
  readonly onViewportChange: (viewport: Viewport) => void
  readonly visible: boolean
  readonly onVisibleChange: (visible: boolean) => void
}

function equalRects(left: readonly WorldRect[], right: readonly WorldRect[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index]
      return (
        other !== undefined &&
        Math.abs(item.x - other.x) < 0.25 &&
        Math.abs(item.y - other.y) < 0.25 &&
        Math.abs(item.width - other.width) < 0.25 &&
        Math.abs(item.height - other.height) < 0.25
      )
    })
  )
}

function cardRect(card: BoardCard): WorldRect {
  return {
    x: card.x,
    y: card.y,
    width: card.width ?? CARD_WIDTH,
    height: card.minimized
      ? MINIMIZED_CARD_HEIGHT
      : (card.height ?? initialResearchCardHeight(card)),
  }
}

export function BoardNavigationController({
  viewport,
  cards,
  currentPage,
  onViewportChange,
  visible,
  onVisibleChange,
}: BoardNavigationControllerProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef(viewport)
  const frameRef = useRef<number | null>(null)
  const [pages, setPages] = useState<readonly WorldRect[]>([])
  const [available, setAvailable] = useState<ViewportSize>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    viewportRef.current = viewport
  }, [viewport])
  const measure = useCallback((): void => {
    const board = hostRef.current?.closest<HTMLElement>(".board-viewport")
    const surface = board?.querySelector<HTMLElement>(".pdf-surface")
    const viewer = surface?.querySelector<HTMLElement>(".pdfViewer")
    if (!board || !surface || !viewer) return
    const surfaceRect = surface.getBoundingClientRect()
    const current = viewportRef.current
    const next = Array.from(viewer.querySelectorAll<HTMLElement>(".page")).map((page) => {
      const rect = page.getBoundingClientRect()
      return {
        x: PAPER_ORIGIN.x + (rect.left - surfaceRect.left) / current.zoom,
        y: PAPER_ORIGIN.y + (rect.top - surfaceRect.top) / current.zoom,
        width: rect.width / current.zoom,
        height: rect.height / current.zoom,
      }
    })
    setPages((currentPages) => (equalRects(currentPages, next) ? currentPages : next))
    setAvailable((currentSize) =>
      currentSize.width === board.clientWidth && currentSize.height === board.clientHeight
        ? currentSize
        : { width: board.clientWidth, height: board.clientHeight },
    )
  }, [])
  const scheduleMeasure = useCallback((): void => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      measure()
    })
  }, [measure])
  useEffect(() => {
    const board = hostRef.current?.closest<HTMLElement>(".board-viewport")
    const viewer = board?.querySelector<HTMLElement>(".pdfViewer")
    if (!board || !viewer) return
    const mutation = new MutationObserver(scheduleMeasure)
    mutation.observe(viewer, { childList: true, subtree: true })
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure)
    resize?.observe(board)
    scheduleMeasure()
    return () => {
      mutation.disconnect()
      resize?.disconnect()
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [scheduleMeasure])
  const cardRects = useMemo(
    () => cards.filter((card) => card.kind !== "highlight").map(cardRect),
    [cards],
  )
  const bounds = useMemo(
    () => symmetricBoardBounds(pages, cardRects, minimumBoardSideSpace),
    [pages, cardRects],
  )
  useLayoutEffect(() => {
    if (!bounds || available.width <= 0 || available.height <= 0) return
    const next = constrainViewportToBounds(viewport, available, bounds, navigationPadding)
    if (Math.abs(next.x - viewport.x) > 0.25 || Math.abs(next.y - viewport.y) > 0.25) {
      onViewportChange(next)
    }
  }, [available, bounds, onViewportChange, viewport])

  if (!bounds || pages.length === 0 || available.width <= 0 || available.height <= 0) {
    return <div ref={hostRef} className="board-navigation-controller" />
  }
  const navigate = (point: { readonly x: number; readonly y: number }): void => {
    onViewportChange(
      centerViewportOnWorldPoint(viewport, available, point, bounds, navigationPadding),
    )
  }
  const firstPage = pages[0]
  const home = (): void => {
    if (!firstPage) return
    onViewportChange(
      constrainViewportToBounds(
        {
          x: available.width / 2 - (firstPage.x + firstPage.width / 2) * viewport.zoom,
          y: navigationPadding - firstPage.y * viewport.zoom,
          zoom: viewport.zoom,
        },
        available,
        bounds,
        navigationPadding,
      ),
    )
  }
  return (
    <div ref={hostRef} className="board-navigation-controller">
      {visible ? (
        <BoardMinimap
          bounds={bounds}
          pages={pages}
          cards={cardRects}
          viewport={viewport}
          available={available}
          currentPage={currentPage}
          onNavigate={navigate}
          onHome={home}
          onClose={() => onVisibleChange(false)}
        />
      ) : (
        <button type="button" className="minimap-show" onClick={() => onVisibleChange(true)}>
          미니맵
        </button>
      )}
    </div>
  )
}
