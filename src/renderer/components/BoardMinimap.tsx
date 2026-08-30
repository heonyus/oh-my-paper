import { RotateCcw, X } from "lucide-react"
import { type JSX, type PointerEvent as ReactPointerEvent, useRef } from "react"
import {
  intersectWorldRects,
  mapMinimapPointToWorld,
  type ViewportSize,
  viewportWorldRect,
  type WorldRect,
  worldRectToMinimap,
} from "../lib/boardNavigation"
import type { Viewport } from "../types"

type BoardMinimapProps = {
  readonly bounds: WorldRect
  readonly pages: readonly WorldRect[]
  readonly cards: readonly WorldRect[]
  readonly viewport: Viewport
  readonly available: ViewportSize
  readonly currentPage: number
  readonly onNavigate: (point: { readonly x: number; readonly y: number }) => void
  readonly onHome: () => void
  readonly onClose?: (() => void) | undefined
}

export function BoardMinimap({
  bounds,
  pages,
  cards,
  viewport,
  available,
  currentPage,
  onNavigate,
  onHome,
  onClose = () => undefined,
}: BoardMinimapProps): JSX.Element {
  const dragging = useRef(false)
  const navigate = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    onNavigate(
      mapMinimapPointToWorld(
        { x: event.clientX, y: event.clientY },
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        bounds,
      ),
    )
  }
  const visibleWorld = intersectWorldRects(viewportWorldRect(viewport, available), bounds)
  const visible = visibleWorld ? worldRectToMinimap(visibleWorld, bounds) : null
  const paper = pages.reduce<WorldRect | null>((combined, page) => {
    if (!combined) return page
    const right = Math.max(combined.x + combined.width, page.x + page.width)
    const bottom = Math.max(combined.y + combined.height, page.y + page.height)
    const x = Math.min(combined.x, page.x)
    const y = Math.min(combined.y, page.y)
    return { x, y, width: right - x, height: bottom - y }
  }, null)
  const minimapDocument = paper ? worldRectToMinimap(paper, bounds) : null
  const activePage = pages[currentPage - 1]
  const minimapActivePage = activePage ? worldRectToMinimap(activePage, bounds) : null
  const minimapCards = cards.map((card) => worldRectToMinimap(card, bounds))
  return (
    <aside className="board-minimap" aria-label="보드 미니맵">
      <header>
        <strong className="board-minimap-title">미니맵</strong>
        <span className="board-minimap-pages">{pages.length}p</span>
        <button type="button" aria-label="첫 페이지로" title="첫 페이지로" onClick={onHome}>
          <RotateCcw size={13} aria-hidden="true" />
        </button>
        <button type="button" aria-label="미니맵 숨기기" title="미니맵 숨기기" onClick={onClose}>
          <X size={13} aria-hidden="true" />
        </button>
      </header>
      <svg
        aria-label="미니맵 탐색"
        role="application"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          navigate(event)
        }}
        onPointerMove={(event) => {
          if (dragging.current) navigate(event)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
        onWheel={(event) => event.stopPropagation()}
      >
        <rect className="minimap-bounds" x={0} y={0} width={100} height={100} />
        {minimapDocument ? <rect className="minimap-document" {...minimapDocument} /> : null}
        {minimapActivePage ? <rect className="minimap-page" {...minimapActivePage} /> : null}
        {minimapCards.map((card) => (
          <rect
            key={`${card.x}:${card.y}:${card.width}:${card.height}`}
            className="minimap-card"
            {...card}
          />
        ))}
        {visible ? <rect className="minimap-viewport" {...visible} /> : null}
      </svg>
      <div className="minimap-legend" aria-hidden="true">
        <span>
          <i data-kind="page" />
          논문
        </span>
        <span>
          <i data-kind="card" />
          카드
        </span>
        <span>
          <i data-kind="view" />
          현재 화면
        </span>
      </div>
    </aside>
  )
}
