import { LocateFixed, Minus, Plus } from "lucide-react"
import { type JSX, type PointerEvent, type RefObject, useEffect } from "react"
import type {
  ScholarlyGraphArticle,
  ScholarlyGraphResult,
} from "../../../shared/scholarlyGraphSchemas"
import {
  edgeIsAdjacent,
  SCHOLARLY_GRAPH_VIEWBOX,
  type ScholarlyGraphPoint,
} from "./scholarlyGraphViewModel"

export interface GraphCanvasViewState {
  readonly scale: number
  readonly x: number
  readonly y: number
}

export interface ScholarlyGraphCanvasProps {
  readonly stageRef: RefObject<HTMLDivElement | null>
  readonly result: ScholarlyGraphResult
  readonly selected: ScholarlyGraphArticle
  readonly positions: ReadonlyMap<string, ScholarlyGraphPoint>
  readonly axis: { readonly year: boolean; readonly citationCount: boolean }
  readonly view: GraphCanvasViewState
  readonly onFit: () => void
  readonly onZoom: (factor: number) => void
  readonly onSelect: (id: string) => void
  readonly onWheel: (event: WheelEvent) => void
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  readonly onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  readonly onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
}

export function ScholarlyGraphCanvas({
  stageRef,
  result,
  selected,
  positions,
  axis,
  view,
  onFit,
  onZoom,
  onSelect,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ScholarlyGraphCanvasProps): JSX.Element {
  useEffect(() => {
    const stage = stageRef.current
    stage?.addEventListener("wheel", onWheel, { passive: false })
    return () => stage?.removeEventListener("wheel", onWheel)
  }, [onWheel, stageRef])
  return (
    <section
      ref={stageRef}
      className="scholarly-graph-stage"
      aria-label="논문 관계 그래프"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="scholarly-graph-controls">
        <button
          type="button"
          aria-label="그래프 맞춤"
          className="discovery-icon-button"
          onClick={onFit}
        >
          <LocateFixed size={15} />
        </button>
        <button
          type="button"
          aria-label="축소"
          className="discovery-icon-button"
          onClick={() => onZoom(0.85)}
        >
          <Minus size={15} />
        </button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button
          type="button"
          aria-label="확대"
          className="discovery-icon-button"
          onClick={() => onZoom(1.15)}
        >
          <Plus size={15} />
        </button>
      </div>
      <svg
        className="scholarly-graph-svg"
        viewBox={`0 0 ${SCHOLARLY_GRAPH_VIEWBOX.width} ${SCHOLARLY_GRAPH_VIEWBOX.height}`}
        aria-label={`${result.nodes.length}개 논문과 ${result.edges.length}개 관계`}
      >
        <title>논문 관계 그래프</title>
        <defs>
          <marker
            id="scholarly-graph-arrow"
            markerUnits="userSpaceOnUse"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--ink-muted)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {axis.year ? (
            <line className="scholarly-graph-axis" x1="80" y1="640" x2="1120" y2="640" />
          ) : null}
          {axis.citationCount ? (
            <line className="scholarly-graph-axis" x1="80" y1="80" x2="80" y2="640" />
          ) : null}
          {result.edges.map((edge) => {
            const from = positions.get(edge.sourceId)
            const to = positions.get(edge.targetId)
            if (!from || !to) return null
            const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1
            const inset = Math.min(23, distance / 3)
            const dx = (to.x - from.x) / distance
            const dy = (to.y - from.y) / distance
            return (
              <line
                key={`${edge.sourceId}-${edge.targetId}-${edge.direction}`}
                className={`scholarly-graph-edge scholarly-graph-edge-${edge.direction}`}
                data-adjacent={edgeIsAdjacent(edge, selected.id)}
                x1={from.x + dx * inset}
                y1={from.y + dy * inset}
                x2={to.x - dx * inset}
                y2={to.y - dy * inset}
                markerEnd={edge.direction === "related" ? undefined : "url(#scholarly-graph-arrow)"}
              />
            )
          })}
          {result.nodes.map((article) => {
            const point = positions.get(article.id)
            if (!point) return null
            const isSelected = article.id === selected.id
            const adjacent =
              isSelected ||
              result.edges.some(
                (edge) =>
                  edgeIsAdjacent(edge, selected.id) &&
                  (edge.sourceId === article.id || edge.targetId === article.id),
              )
            return (
              <g
                key={article.id}
                className="scholarly-graph-node"
                data-selected={isSelected}
                data-seed={article.id === result.seedIds[0]}
                data-adjacent={adjacent}
                data-direction={
                  result.edges.find(
                    (edge) => edge.direction === "cited_by" && edge.sourceId === article.id,
                  )?.direction ??
                  result.edges.find((edge) => edge.targetId === article.id)?.direction ??
                  "references"
                }
              >
                <foreignObject x={point.x - 30} y={point.y - 30} width="60" height="60">
                  <button
                    type="button"
                    className="scholarly-graph-node-button"
                    aria-label={`${article.title}${article.year ? `, ${article.year}` : ""}`}
                    onClick={() => onSelect(article.id)}
                  >
                    <span aria-hidden="true" />
                  </button>
                </foreignObject>
                <text className="scholarly-graph-node-meta" x={point.x} y={point.y + 36}>
                  {article.authors[0]?.split(/\s+/u).at(-1) ?? "저자 미상"} ·{" "}
                  {article.year ?? "연도 미상"}
                </text>
              </g>
            )
          })}
          {axis.year ? (
            <text className="scholarly-graph-axis-label" x="1040" y="680">
              발행 연도
            </text>
          ) : null}
          {axis.citationCount ? (
            <text
              className="scholarly-graph-axis-label"
              x="34"
              y="92"
              transform="rotate(-90 34 92)"
            >
              피인용 수 (로그)
            </text>
          ) : null}
          {result.nodes.some((node) => node.year === null || node.citationCount === null) ? (
            <text className="scholarly-graph-axis-label" x="80" y="715">
              미확인 메타데이터 영역
            </text>
          ) : null}
        </g>
      </svg>
      <details className="scholarly-graph-list">
        <summary>논문 목록 ({result.nodes.length})</summary>
        <ol>
          {result.nodes.map((article) => (
            <li key={article.id}>
              <button
                type="button"
                data-selected={article.id === selected.id}
                onClick={() => onSelect(article.id)}
              >
                {article.title}
                <small>
                  {[
                    article.authors[0],
                    article.year,
                    article.citationCount === null ? null : `${article.citationCount}회`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
