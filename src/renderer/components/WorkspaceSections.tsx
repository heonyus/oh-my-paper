import { type JSX, lazy, Suspense, useState } from "react"
import type { EvidenceAnchorId, KnowledgeNodeId } from "../../shared/knowledgeSchemas"
import type { KnowledgeClientOps, WorkspaceViewMode } from "../lib/knowledgeTypes"
import type { BoardCard, DocumentRecord } from "../types"
import "./workspace-sections.css"

const MemoryView = lazy(() =>
  import("./memory/MemoryView").then((module) => ({ default: module.MemoryView })),
)

const KnowledgeView = lazy(() =>
  import("./knowledge/KnowledgeView").then((module) => ({ default: module.KnowledgeView })),
)
const ConnectionsWorkspace = lazy(() =>
  import("./knowledge/ConnectionsWorkspace").then((module) => ({
    default: module.ConnectionsWorkspace,
  })),
)
const CompareView = lazy(() =>
  import("./knowledge/CompareView").then((module) => ({ default: module.CompareView })),
)
const ProjectBoardView = lazy(() =>
  import("./knowledge/ProjectBoardView").then((module) => ({ default: module.ProjectBoardView })),
)
const TransferPanel = lazy(() =>
  import("./TransferPanel").then((module) => ({ default: module.TransferPanel })),
)
const DiscoveryWorkspace = lazy(() =>
  import("./discovery/DiscoveryWorkspace").then((module) => ({
    default: module.DiscoveryWorkspace,
  })),
)

export function WorkspaceSections({
  mode,
  clientOps,
  nodeId,
  onNodeSelect,
  onNavigate,
  onEvidence,
  document,
  cards,
}: {
  readonly mode: WorkspaceViewMode
  readonly clientOps: KnowledgeClientOps
  readonly nodeId: KnowledgeNodeId | null
  readonly onNodeSelect: (id: KnowledgeNodeId) => void
  readonly onNavigate: (mode: WorkspaceViewMode) => void
  readonly onEvidence: (id: EvidenceAnchorId) => void
  readonly document: DocumentRecord | null
  readonly cards: readonly BoardCard[]
}): JSX.Element {
  const [knowledgeVisited, setKnowledgeVisited] = useState(mode === "knowledge")
  if (mode === "knowledge" && !knowledgeVisited) setKnowledgeVisited(true)
  const [visitedViews, setVisitedViews] = useState<readonly WorkspaceViewMode[]>([])
  if (mode !== "reader" && mode !== "knowledge" && !visitedViews.includes(mode)) {
    setVisitedViews([...visitedViews, mode])
  }
  const discovery = window.scourgify?.discovery
  const memory = window.scourgify?.memory
  const [error, setError] = useState<string | null>(null)
  const openNode = (id: KnowledgeNodeId): void => {
    onNodeSelect(id)
    onNavigate("knowledge")
  }
  return (
    <>
      {knowledgeVisited ? (
        <section
          style={{
            position: "relative",
            zIndex: 1,
            gridColumn: "2 / -1",
            gridRow: 2,
            minHeight: 0,
            minWidth: 0,
            display: mode === "knowledge" ? "flex" : "none",
          }}
          aria-label="노트와 지식"
        >
          <Suspense fallback={<p role="status">노트를 여는 중…</p>}>
            <KnowledgeView
              clientOps={clientOps}
              initialNodeId={nodeId}
              onNodeSelect={onNodeSelect}
              onJumpToEvidence={onEvidence}
            />
          </Suspense>
        </section>
      ) : null}
      {visitedViews.map((visitedMode) => (
        <section
          key={visitedMode}
          style={{
            position: "relative",
            zIndex: 1,
            gridColumn: "2 / -1",
            gridRow: 2,
            minHeight: 0,
            minWidth: 0,
            display: mode === visitedMode ? "flex" : "none",
            overflow: "auto",
          }}
        >
          <Suspense fallback={<p role="status">화면을 여는 중…</p>}>
            {visitedMode === "graph" ? (
              <ConnectionsWorkspace
                graphApi={window.scourgify?.scholarlyGraph}
                discovery={discovery}
                onSearch={() => onNavigate("search")}
                onOpenExternal={(url) => {
                  void window.scourgify
                    .openExternal({ url })
                    .catch(() => setError("링크를 열지 못했습니다."))
                }}
                isVisible={mode === "graph"}
                clientOps={clientOps}
                activeNodeId={nodeId}
                onNodeClick={openNode}
                onEvidenceClick={onEvidence}
              />
            ) : null}
            {visitedMode === "compare" ? (
              <CompareView
                isVisible={mode === "compare"}
                clientOps={clientOps}
                onJumpToEvidence={onEvidence}
              />
            ) : null}
            {visitedMode === "memory" && memory ? <MemoryView api={memory} /> : null}
            {visitedMode === "project" ? (
              <div className="project-workspace">
                <ProjectBoardView
                  isVisible={mode === "project"}
                  clientOps={clientOps}
                  onNodeClick={openNode}
                />
                <details className="project-evidence-transfer">
                  <summary>읽기 카드를 지식으로 연결</summary>
                  <TransferPanel
                    document={document}
                    cards={cards}
                    clientOps={clientOps}
                    onNodeCreated={onNodeSelect}
                  />
                </details>
              </div>
            ) : null}
            {visitedMode === "search" && discovery ? (
              <DiscoveryWorkspace
                active={mode === "search"}
                discovery={discovery}
                graphApi={window.scourgify?.scholarlyGraph}
                research={window.scourgify?.research}
                clientOps={clientOps}
                onOpenNode={openNode}
                onOpenExternal={(url) => {
                  void window.scourgify
                    .openExternal({ url })
                    .catch(() => setError("링크를 열지 못했습니다."))
                }}
              />
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
          </Suspense>
        </section>
      ))}
    </>
  )
}
