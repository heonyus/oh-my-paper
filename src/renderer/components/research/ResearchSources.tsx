import type { JSX } from "react"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ResearchSource } from "../../../shared/researchSourceSchemas"
import { parseLocalResearchSourceId } from "./localResearchSource"
import "./researchSources.css"

const accessText: Readonly<Record<ResearchSource["access"], string>> = {
  metadata_only: "metadata-only",
  html_excerpt: "검증된 HTML 발췌",
  pdf_binary: "PDF binary only",
  local_excerpt: "로컬 노트 발췌",
}

export function ResearchSources({
  sources,
  onOpenLocalSource,
}: {
  readonly sources: readonly ResearchSource[]
  readonly onOpenLocalSource?: ((nodeId: KnowledgeNodeId) => void) | undefined
}): JSX.Element | null {
  if (sources.length === 0) return null
  return (
    <section className="research-sources" aria-labelledby="research-sources-title">
      <h2 id="research-sources-title">확인한 자료</h2>
      <ol>
        {sources.map((source) => {
          const localId =
            source.origin === "local" ? parseLocalResearchSourceId(source.finalUrl) : null
          return (
            <li key={source.id}>
              {source.origin === "web" ? (
                <a href={source.finalUrl} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              ) : localId !== null && onOpenLocalSource !== undefined ? (
                <button
                  className="research-source-link"
                  type="button"
                  onClick={() => onOpenLocalSource(localId)}
                >
                  {source.title}
                </button>
              ) : (
                <strong>{source.title}</strong>
              )}
              <span>
                {accessText[source.access]} ·{" "}
                {source.page === null ? "페이지 미확인" : `${source.page}쪽`}
              </span>
              <code>{source.finalUrl}</code>
              {source.snippet ? <p>{source.snippet}</p> : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
