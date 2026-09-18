import { type JSX, useState } from "react"
import type { DiscoveryApi } from "../../../shared/discoveryIpc"
import type { ScholarlyGraphApi } from "../../../shared/scholarlyGraphIpc"
import type { ScholarlySearchItem } from "../../../shared/scholarlySearchSchemas"
import { ScholarlyGraphView } from "../discovery/ScholarlyGraphView"
import { NeighbourGraphView, type NeighbourGraphViewProps } from "./NeighbourGraphView"
import { paperGraphSeed } from "./paperGraphSeed"
import "./connections-workspace.css"

export function ConnectionsWorkspace({
  graphApi,
  discovery,
  onSearch,
  onOpenExternal,
  ...knowledge
}: NeighbourGraphViewProps & {
  readonly graphApi: ScholarlyGraphApi | undefined
  readonly discovery: DiscoveryApi | undefined
  readonly onSearch: () => void
  readonly onOpenExternal: (url: string) => void
}): JSX.Element {
  const [scope, setScope] = useState<"papers" | "knowledge">("papers")
  const [identifier, setIdentifier] = useState("")
  const [seed, setSeed] = useState<ScholarlySearchItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="connections-workspace">
      <nav className="connections-scope" aria-label="연결 탐색 범위">
        <button type="button" aria-pressed={scope === "papers"} onClick={() => setScope("papers")}>
          논문 그래프
        </button>
        <button
          type="button"
          aria-pressed={scope === "knowledge"}
          onClick={() => setScope("knowledge")}
        >
          내 지식 연결
        </button>
      </nav>
      <div className="connections-content" hidden={scope !== "papers"}>
        {seed && graphApi && discovery ? (
          <ScholarlyGraphView
            api={graphApi}
            discovery={discovery}
            seed={seed}
            active={scope === "papers" && knowledge.isVisible !== false}
            onClose={() => setSeed(null)}
            onOpenNode={knowledge.onNodeClick}
            onOpenExternal={onOpenExternal}
          />
        ) : (
          <section className="connections-start" aria-labelledby="paper-network-title">
            <h1 id="paper-network-title">한 편의 논문에서 탐색을 시작하세요</h1>
            <p>참고문헌과 인용한 논문, 관련 연구를 연결해서 살펴봅니다.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const next = paperGraphSeed(identifier)
                if (!next) {
                  setError("DOI 또는 OpenAlex 논문 주소를 입력하세요.")
                  return
                }
                setError(null)
                setSeed(next)
              }}
            >
              <label htmlFor="paper-network-seed">DOI 또는 OpenAlex 주소</label>
              <div>
                <input
                  id="paper-network-seed"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="10.1038/nature14539"
                  autoComplete="off"
                  required
                />
                <button type="submit" disabled={!graphApi || !discovery}>
                  논문 그래프 열기
                </button>
              </div>
            </form>
            {error ? <p role="alert">{error}</p> : null}
            {!graphApi || !discovery ? (
              <p role="status">현재 실행 환경에서는 논문 관계 조회를 사용할 수 없습니다.</p>
            ) : null}
            <button type="button" className="connections-search" onClick={onSearch}>
              제목이나 주제로 논문 검색
            </button>
            <p className="connections-source-note">
              OpenAlex의 공개 서지 정보를 조회합니다. PDF와 개인 노트는 전송하지 않습니다.
            </p>
          </section>
        )}
      </div>
      <div className="connections-content" hidden={scope !== "knowledge"}>
        <NeighbourGraphView
          {...knowledge}
          isVisible={knowledge.isVisible !== false && scope === "knowledge"}
        />
      </div>
    </div>
  )
}
