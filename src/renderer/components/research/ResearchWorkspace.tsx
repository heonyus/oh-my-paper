import { type JSX, useState } from "react"
import type { KnowledgeNode, KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ResearchApi } from "../../../shared/researchIpc"
import type { KnowledgeClientOps } from "../../lib/knowledgeTypes"
import { knowledgeNodeKindLabel } from "../knowledge/knowledgeLabels"
import { ResearchView } from "./ResearchView"
import "./research-workspace.css"

export function ResearchWorkspace({
  research,
  active = true,
  clientOps,
  onOpenNode,
}: {
  readonly research: ResearchApi
  readonly active?: boolean
  readonly clientOps: KnowledgeClientOps
  readonly onOpenNode: (id: KnowledgeNodeId) => void
}): JSX.Element {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<readonly KnowledgeNode[]>([])
  const [selected, setSelected] = useState<readonly KnowledgeNode[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  async function search(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setResults(await clientOps.findNodes({ search: query, limit: 100 }))
      setSearched(true)
    } catch {
      setError("자료 목록을 읽지 못했습니다. 다시 시도하세요.")
    } finally {
      setBusy(false)
    }
  }
  function toggle(node: KnowledgeNode): void {
    setSelected((current) =>
      current.some(({ id }) => id === node.id)
        ? current.filter(({ id }) => id !== node.id)
        : current.length < 20
          ? [...current, node]
          : current,
    )
  }
  return (
    <div className="research-workspace">
      <details className="research-source-picker">
        <summary>조사에 사용할 내 자료 · {selected.length} / 20개</summary>
        <p>선택한 자료의 앞부분 최대 2만 자만 전달됩니다. 원문 전체를 읽는 작업은 아닙니다.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void search()
          }}
        >
          <label>
            자료 찾기
            <input
              value={query}
              maxLength={500}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "찾는 중…" : "자료 목록 보기"}
          </button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
        {searched && results.length === 0 ? <p>검색된 자료가 없습니다.</p> : null}
        <ul>
          {results.map((node) => {
            const checked = selected.some(({ id }) => id === node.id)
            return (
              <li key={node.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && selected.length >= 20}
                    onChange={() => toggle(node)}
                  />
                  <span>
                    {node.title} <small>· {knowledgeNodeKindLabel(node.kind)}</small>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        {results.length === 100 ? <p>처음 100개입니다. 검색어로 범위를 좁혀주세요.</p> : null}
      </details>
      {selected.length ? (
        <section className="research-selected" aria-label="선택한 조사 자료">
          {selected.map((node) => (
            <button
              type="button"
              key={node.id}
              aria-label={`${node.title} 선택 해제`}
              onClick={() => toggle(node)}
            >
              {node.title} ×
            </button>
          ))}
        </section>
      ) : null}
      <ResearchView
        research={research}
        active={active}
        localSourceIds={selected.map(({ id }) => id)}
        onOpenReport={onOpenNode}
      />
    </div>
  )
}
