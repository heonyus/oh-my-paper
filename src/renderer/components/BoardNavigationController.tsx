import {
  type JSX,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { paperOrigin } from "../../shared/uiLayout"
import { CARD_WIDTH, initialResearchCardHeight, MINIMIZED_CARD_HEIGHT } from "../lib/board"
import {
  centerViewportOnWorldPoint,
  constrainViewportToBounds,
  hasCompletePageSet,
  type PanReach,
  symmetricBoardBounds,
  type ViewportConstraint,
  type ViewportSize,
  type WorldRect,
} from "../lib/boardNavigation"
import type { BoardCard, Viewport } from "../types"
import { BoardMinimap } from "./BoardMinimap"

const navigationPadding = 40
const minimumBoardSideSpace = 720
/** How far content may be pushed past its bounds, so panning never feels walled in. */
const maximumPanSlack = 360

type BoardNavigationControllerProps = {
  readonly viewport: Viewport
  readonly cards: readonly BoardCard[]
  readonly currentPage: number
  readonly pageCount: number
  readonly onViewportChange: (viewport: Viewport) => void
  readonly visible: boolean
  readonly onVisibleChange: (visible: boolean) => void
  readonly panning: boolean
  readonly panConstraintRef: RefObject<ViewportConstraint>
  /** Screen width covered on the right by the research sidebar. */
  readonly occludedRight?: number | undefined
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
  pageCount,
  onViewportChange,
  visible,
  onVisibleChange,
  panning,
  panConstraintRef,
  occludedRight,
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
        x: paperOrigin.x + (rect.left - surfaceRect.left) / current.zoom,
        y: paperOrigin.y + (rect.top - surfaceRect.top) / current.zoom,
        width: rect.width / current.zoom,
        height: rect.height / current.zoom,
      }
    })
    setPages((currentPages) => {
      if (currentPages.length > 0 && next.length < currentPages.length) return currentPages
      return equalRects(currentPages, next) ? currentPages : next
    })
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
  useEffect(() => {
    if (!panning) scheduleMeasure()
  }, [panning, scheduleMeasure])
  const cardRects = useMemo(
    () => cards.filter((card) => card.kind !== "highlight").map(cardRect),
    [cards],
  )
  const bounds = useMemo(
    () => symmetricBoardBounds(pages, cardRects, minimumBoardSideSpace),
    [pages, cardRects],
  )
  const reach = useMemo<PanReach>(
    () => ({
      slack: Math.min(available.width * 0.25, maximumPanSlack),
      occludedRight: occludedRight ?? 0,
    }),
    [available.width, occludedRight],
  )
  useLayoutEffect(() => {
    if (
      !bounds ||
      !hasCompletePageSet(pages, pageCount) ||
      available.width <= 0 ||
      available.height <= 0
    ) {
      panConstraintRef.current = (candidate) => candidate
      return
    }
    panConstraintRef.current = (candidate) =>
      constrainViewportToBounds(candidate, available, bounds, navigationPadding, reach)
  }, [available, bounds, pageCount, pages, panConstraintRef, reach])
  if (
    !bounds ||
    !hasCompletePageSet(pages, pageCount) ||
    available.width <= 0 ||
    available.height <= 0
  ) {
    return <div ref={hostRef} className="board-navigation-controller" />
  }
  const navigate = (point: { readonly x: number; readonly y: number }): void => {
    onViewportChange(
      centerViewportOnWorldPoint(viewport, available, point, bounds, navigationPadding, reach),
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
        reach,
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
