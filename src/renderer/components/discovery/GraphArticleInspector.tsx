import { BookmarkPlus, ExternalLink, GitBranch, LoaderCircle } from "lucide-react"
import { type JSX, useState } from "react"
import type { DiscoverySaveResult } from "../../../shared/discoveryIpc"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type {
  ScholarlyGraphArticle,
  ScholarlyGraphDirection,
} from "../../../shared/scholarlyGraphSchemas"
import { directionLabel } from "./scholarlyGraphViewModel"

type SaveState =
  | { readonly status: "idle" | "saving" }
  | { readonly status: "done"; readonly result: DiscoverySaveResult }
  | { readonly status: "error"; readonly message: string }

export interface GraphArticleInspectorProps {
  readonly article: ScholarlyGraphArticle
  readonly onSave: (article: ScholarlyGraphArticle) => Promise<DiscoverySaveResult>
  readonly onSaved?: ((id: KnowledgeNodeId) => void) | undefined
  readonly onOpenExternal?: ((url: string) => void) | undefined
  readonly onExpand: (direction: ScholarlyGraphDirection) => void
}

function sourceUrl(article: ScholarlyGraphArticle): string | null {
  return article.sourceUrl ?? article.doi
}

export function GraphArticleInspector({
  article,
  onSave,
  onSaved,
  onOpenExternal,
  onExpand,
}: GraphArticleInspectorProps): JSX.Element {
  const [save, setSave] = useState<SaveState>({ status: "idle" })
  async function saveArticle(): Promise<void> {
    setSave({ status: "saving" })
    try {
      const result = await onSave(article)
      setSave({ status: "done", result })
    } catch (cause) {
      setSave({
        status: "error",
        message: cause instanceof Error ? cause.message : "라이브러리에 저장하지 못했습니다.",
      })
    }
  }
  const source = sourceUrl(article)
  return (
    <aside className="scholarly-graph-inspector" aria-label="선택한 논문 상세">
      <div className="scholarly-graph-inspector-content">
        <div className="scholarly-graph-inspector-heading">
          <span>
            <GitBranch size={15} aria-hidden="true" /> 선택한 논문
          </span>
          <small>OpenAlex</small>
        </div>
        <h2>{article.title}</h2>
        <p className="scholarly-graph-inspector-byline">
          {[article.authors.slice(0, 5).join(", "), article.year].filter(Boolean).join(" · ") ||
            "저자·연도 확인되지 않음"}
        </p>
        <dl className="scholarly-graph-inspector-meta">
          <div>
            <dt>피인용 수</dt>
            <dd>
              {article.citationCount === null ? "확인되지 않음" : `${article.citationCount}회`}
            </dd>
          </div>
          <div>
            <dt>DOI</dt>
            <dd>{article.doi ?? "확인되지 않음"}</dd>
          </div>
        </dl>
        <section className="scholarly-graph-inspector-section">
          <h3>초록</h3>
          <p>{article.abstract ?? "이 제공자는 초록을 제공하지 않았습니다."}</p>
        </section>
      </div>
      <section className="scholarly-graph-inspector-section scholarly-graph-inspector-explore">
        <div className="scholarly-graph-inspector-actions">
          {source && onOpenExternal ? (
            <button
              type="button"
              className="discovery-button discovery-button-primary"
              onClick={() => onOpenExternal(source)}
            >
              <ExternalLink size={15} /> 원문 열기
            </button>
          ) : null}
          <button
            type="button"
            className="discovery-button"
            disabled={save.status === "saving" || save.status === "done"}
            onClick={() => void saveArticle()}
          >
            {save.status === "saving" ? (
              <LoaderCircle size={15} className="scholarly-graph-spinner" />
            ) : (
              <BookmarkPlus size={15} />
            )}
            {save.status === "done" ? "저장됨" : "라이브러리에 저장"}
          </button>
        </div>
        {save.status === "done" ? (
          <p className="scholarly-graph-saved" role="status">
            {save.result.status === "duplicate"
              ? "기존 라이브러리 항목을 사용했습니다."
              : "지식 라이브러리에 저장했습니다."}
          </p>
        ) : null}
        {save.status === "done" && onSaved ? (
          <button
            type="button"
            className="discovery-link"
            onClick={() => onSaved(save.result.node.id)}
          >
            저장한 지식 열기
          </button>
        ) : null}
        {save.status === "error" ? (
          <p className="discovery-error" role="alert">
            {save.message}
          </p>
        ) : null}
        <h3>더 탐색</h3>
        <div className="scholarly-graph-expansion-actions">
          {(["related", "references", "cited_by"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              className="discovery-button"
              onClick={() => onExpand(direction)}
            >
              {directionLabel(direction)}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
