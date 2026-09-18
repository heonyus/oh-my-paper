import { type JSX, lazy, Suspense, useState } from "react"
import type { DiscoveryApi } from "../../../shared/discoveryIpc"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ResearchApi } from "../../../shared/researchIpc"
import type { ScholarlyGraphApi } from "../../../shared/scholarlyGraphIpc"
import type { ScholarlySearchItem } from "../../../shared/scholarlySearchSchemas"
import type { KnowledgeClientOps } from "../../lib/knowledgeTypes"
import { scholarlyItemKey } from "./discoveryViewModel"
import { ScholarlyGraphView } from "./ScholarlyGraphView"
import { SearchView } from "./SearchView"
import "../research/research-workspace.css"

const ResearchWorkspace = lazy(() =>
  import("../research/ResearchWorkspace").then((module) => ({ default: module.ResearchWorkspace })),
)

export function DiscoveryWorkspace({
  discovery,
  graphApi,
  research,
  clientOps,
  onOpenNode,
  onOpenExternal,
  active = true,
}: {
  readonly discovery: DiscoveryApi
  readonly graphApi?: ScholarlyGraphApi | undefined
  readonly research: ResearchApi | undefined
  readonly clientOps: KnowledgeClientOps
  readonly onOpenNode: (id: KnowledgeNodeId) => void
  readonly onOpenExternal: (url: string) => void
  readonly active?: boolean
}): JSX.Element {
  const [mode, setMode] = useState<"search" | "research" | "graph">("search")
  const [graphSeed, setGraphSeed] = useState<ScholarlySearchItem | null>(null)
  return (
    <div className="discovery-workspace">
      <nav className="discovery-mode" aria-label="검색 방식">
        <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")}>
          학술 검색
        </button>
        <button
          type="button"
          aria-pressed={mode === "research"}
          disabled={!research}
          onClick={() => setMode("research")}
        >
          근거 조사
        </button>
        {graphSeed && graphApi ? (
          <button type="button" aria-pressed={mode === "graph"} onClick={() => setMode("graph")}>
            논문 그래프
          </button>
        ) : null}
      </nav>
      <div hidden={mode !== "search"}>
        <SearchView
          discovery={discovery}
          onOpenExternal={onOpenExternal}
          onOpenNode={onOpenNode}
          onOpenGraph={(item) => {
            setGraphSeed(item)
            setMode("graph")
          }}
        />
      </div>
      {graphSeed && graphApi ? (
        <div hidden={mode !== "graph"}>
          <ScholarlyGraphView
            key={scholarlyItemKey(graphSeed)}
            api={graphApi}
            discovery={discovery}
            seed={graphSeed}
            active={active && mode === "graph"}
            onClose={() => setMode("search")}
            onOpenExternal={onOpenExternal}
            onOpenNode={onOpenNode}
          />
        </div>
      ) : null}
      {research ? (
        <div hidden={mode !== "research"}>
          <Suspense fallback={<p role="status">조사 화면을 여는 중…</p>}>
            <ResearchWorkspace
              research={research}
              active={active && mode === "research"}
              clientOps={clientOps}
              onOpenNode={onOpenNode}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  )
}
