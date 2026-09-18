import { ArrowLeft, ArrowRight, X } from "lucide-react"
import {
  type JSX,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { DiscoveryApi, DiscoverySaveResult } from "../../../shared/discoveryIpc"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ScholarlyGraphApi } from "../../../shared/scholarlyGraphIpc"
import type { ScholarlyGraphArticle } from "../../../shared/scholarlyGraphSchemas"
import type { ScholarlySearchItem } from "../../../shared/scholarlySearchSchemas"
import { GraphArticleInspector } from "./GraphArticleInspector"
import { ScholarlyGraphCanvas } from "./ScholarlyGraphCanvas"
import "./discovery.css"
import "./discovery-results.css"
import {
  axisAvailability,
  graphArticleKey,
  graphArticleToSearchItem,
  graphPositions,
  SCHOLARLY_GRAPH_VIEWBOX,
} from "./scholarlyGraphViewModel"
import "./scholarly-graph.css"
import { useScholarlyGraphData } from "./useScholarlyGraphData"

export interface ScholarlyGraphViewProps {
  readonly api: ScholarlyGraphApi
  readonly discovery: DiscoveryApi
  readonly seed: ScholarlySearchItem
  readonly active?: boolean
  readonly onClose: () => void
  readonly onOpenExternal?: ((url: string) => void) | undefined
  readonly onOpenNode?: ((id: KnowledgeNodeId) => void) | undefined
}

type ViewState = { readonly scale: number; readonly x: number; readonly y: number }
const MIN_SCALE = 0.25
const MAX_SCALE = 2.5
const clampScale = (value: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))

function graphScaleFactor(
  current: ViewState,
  factor: number,
  point: { x: number; y: number },
): ViewState {
  const scale = clampScale(current.scale * factor)
  const worldX = (point.x - current.x) / current.scale
  const worldY = (point.y - current.y) / current.scale
  return { scale, x: point.x - worldX * scale, y: point.y - worldY * scale }
}

function graphPoint(stage: HTMLDivElement | null, x: number, y: number): DOMPoint | null {
  const matrix = stage?.querySelector("svg")?.getScreenCTM()
  return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : null
}

export function ScholarlyGraphView({
  api,
  discovery,
  seed,
  onClose,
  active = true,
  onOpenExternal,
  onOpenNode,
}: ScholarlyGraphViewProps): JSX.Element {
  const {
    result,
    selectedId,
    history,
    historyIndex,
    status,
    message,
    load,
    select,
    moveHistory,
    retry,
  } = useScholarlyGraphData(api, seed, active)
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    readonly x: number
    readonly y: number
    readonly view: ViewState
  } | null>(null)

  const fitGraph = useCallback((): void => {
    setView({ scale: 1, x: 0, y: 0 })
  }, [])
  useEffect(() => {
    if (result) fitGraph()
  }, [fitGraph, result])
  const selected =
    result?.nodes.find((node) => graphArticleKey(node) === selectedId) ?? result?.nodes[0]
  const positions = useMemo(
    () => (result ? graphPositions(result, result.seedIds[0] ?? "") : new Map()),
    [result],
  )
  const axis = useMemo(() => axisAvailability(result?.nodes ?? []), [result])
  const handleWheel = (event: WheelEvent): void => {
    if (event.target instanceof Element && event.target.closest("details, button")) return
    event.preventDefault()
    const point = graphPoint(stageRef.current, event.clientX, event.clientY)
    if (!point) return
    setView((current) => graphScaleFactor(current, event.deltaY < 0 ? 1.1 : 0.9, point))
  }
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest("button, details"))
    )
      return
    const point = graphPoint(stageRef.current, event.clientX, event.clientY)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: point.x, y: point.y, view }
  }
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const point = graphPoint(stageRef.current, event.clientX, event.clientY)
    if (!point) return
    setView({
      ...drag.view,
      x: drag.view.x + point.x - drag.x,
      y: drag.view.y + point.y - drag.y,
    })
  }
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const saveArticle = async (article: ScholarlyGraphArticle): Promise<DiscoverySaveResult> =>
    discovery.saveMetadata({ item: graphArticleToSearchItem(article) })

  return (
    <main className="scholarly-graph" aria-labelledby="scholarly-graph-title">
      <header className="scholarly-graph-header">
        <div>
          <h1 id="scholarly-graph-title">논문 관계 탐색</h1>
        </div>
        <button
          type="button"
          className="discovery-icon-button"
          onClick={onClose}
          aria-label="그래프 닫기"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <div className="scholarly-graph-toolbar">
        <button
          type="button"
          className="discovery-button"
          disabled={historyIndex <= 0}
          onClick={() => moveHistory(historyIndex - 1)}
        >
          <ArrowLeft size={15} /> 이전
        </button>
        <button
          type="button"
          className="discovery-button"
          disabled={historyIndex < 0 || historyIndex >= history.length - 1}
          onClick={() => moveHistory(historyIndex + 1)}
        >
          다음 <ArrowRight size={15} />
        </button>
        <span className="scholarly-graph-provenance">OpenAlex · 한 번에 주변 논문 최대 20개</span>
        <span className="scholarly-graph-legend">
          <span data-direction="references">참고문헌</span>
          <span data-direction="cited_by">피인용</span>
          <span data-direction="related">관련</span>
        </span>
        {result?.truncated ? (
          <span className="scholarly-graph-limit">표시 한도에 도달했습니다.</span>
        ) : null}
      </div>
      {status === "loading" ? (
        <p className="scholarly-graph-status" role="status">
          관계 데이터를 불러오는 중…
        </p>
      ) : null}
      {message ? (
        <p className="scholarly-graph-status scholarly-graph-error" role="alert">
          {message}
        </p>
      ) : null}
      {status === "error" ? (
        <button type="button" className="discovery-button" onClick={retry}>
          다시 시도
        </button>
      ) : null}
      {result?.directions.some((direction) => direction.status === "error") ? (
        <p className="scholarly-graph-status" role="status">
          일부 관계 방향은 제공자 오류로 표시하지 못했습니다.
        </p>
      ) : null}
      {result && result.nodes.length <= 1 ? (
        <p className="scholarly-graph-status" role="status">
          이 논문에서 확인된 관계가 없습니다. 다른 방향을 선택해 다시 탐색할 수 있습니다.
        </p>
      ) : null}
      {result && selected ? (
        <div className="scholarly-graph-layout">
          <ScholarlyGraphCanvas
            stageRef={stageRef}
            result={result}
            selected={selected}
            positions={positions}
            axis={axis}
            view={view}
            onFit={fitGraph}
            onZoom={(factor) =>
              setView((current) =>
                graphScaleFactor(current, factor, {
                  x: SCHOLARLY_GRAPH_VIEWBOX.width / 2,
                  y: SCHOLARLY_GRAPH_VIEWBOX.height / 2,
                }),
              )
            }
            onSelect={select}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <GraphArticleInspector
            key={selected.id}
            article={selected}
            onSave={saveArticle}
            onSaved={onOpenNode}
            onOpenExternal={onOpenExternal}
            onExpand={(direction) => void load(graphArticleToSearchItem(selected), [direction])}
          />
        </div>
      ) : null}
    </main>
  )
}
