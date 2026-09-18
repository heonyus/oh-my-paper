import { PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react"
import type { JSX } from "react"
import {
  type KnowledgeNode,
  type KnowledgeNodeKind,
  knowledgeNodeKindSchema,
} from "../../../shared/knowledgeSchemas"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"

interface NodeListViewProps {
  readonly nodes: readonly KnowledgeNode[]
  readonly selectedId: KnowledgeNode["id"] | null
  readonly onSelect: (node: KnowledgeNode) => void
  readonly searchQuery: string
  readonly onSearchChange: (query: string) => void
  readonly selectedKind: KnowledgeNodeKind | "all"
  readonly onKindChange: (kind: KnowledgeNodeKind | "all") => void
  readonly onCreate: () => void
  readonly loading: boolean
  readonly collapsed?: boolean
  readonly onToggle?: () => void
}

const ALL_KINDS: readonly (KnowledgeNodeKind | "all")[] = [
  "all",
  "concept",
  "claim",
  "paper",
  "note",
  "evidence",
  "question",
  "hypothesis",
  "experiment",
  "project",
]

function parseKind(value: string): KnowledgeNodeKind | "all" | null {
  if (value === "all") return "all"
  return knowledgeNodeKindSchema.safeParse(value).data ?? null
}

export function NodeListView({
  nodes,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  selectedKind,
  onKindChange,
  onCreate,
  loading,
  collapsed = false,
  onToggle,
}: NodeListViewProps): JSX.Element {
  return (
    <section className="knowledge-pane knowledge-list-pane" aria-label="지식 항목 목록">
      <div className="knowledge-header">
        <h2>지식</h2>
        <button
          type="button"
          className="knowledge-btn knowledge-create"
          aria-label="생성"
          title="새 항목 만들기"
          onClick={onCreate}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        {onToggle ? (
          <button
            type="button"
            className="knowledge-btn knowledge-list-toggle"
            aria-label={collapsed ? "지식 목록 펼치기" : "지식 목록 접기"}
            onClick={onToggle}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        ) : null}
      </div>
      <div className="knowledge-list-tools">
        <div className="knowledge-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            className="knowledge-input"
            placeholder="검색"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="지식 검색"
          />
        </div>
        <label className="knowledge-kind-filter">
          <select
            className="knowledge-input"
            aria-label="지식 종류 필터"
            value={selectedKind}
            onChange={(event) => {
              const kind = parseKind(event.target.value)
              if (kind) onKindChange(kind)
            }}
          >
            {ALL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === "all" ? "모든 항목" : knowledgeNodeKindLabel(kind)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? <p className="knowledge-help knowledge-empty">불러오는 중...</p> : null}
      <ul className="knowledge-item-list">
        {!loading && nodes.length === 0 ? (
          <li className="knowledge-empty">검색된 지식이 없습니다.</li>
        ) : (
          nodes.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className="knowledge-item-btn"
                data-active={node.id === selectedId}
                aria-current={node.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(node)}
              >
                <span className="knowledge-badge">{knowledgeNodeKindLabel(node.kind)}</span>
                <strong className="knowledge-item-title">{node.title}</strong>
                {node.aliases.length > 0 ? (
                  <small className="knowledge-item-meta">별칭: {node.aliases.join(", ")}</small>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
      <p className="knowledge-list-count">{nodes.length}개 항목</p>
    </section>
  )
}
