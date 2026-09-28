import { BookOpen, ExternalLink } from "lucide-react"
import type { JSX } from "react"
import type { AgentPaper } from "../../shared/agentChat"

export type PaperOpenState = "idle" | "importing" | "failed"

const relevanceLabels: Readonly<Record<number, string>> = {
  3: "핵심",
  2: "관련",
  1: "약한 관련",
}

export function paperKey(paper: AgentPaper): string {
  return `${paper.provider}:${paper.title}`
}

export function ResearchPaperCard({
  paper,
  index,
  openState,
  onOpenInReader,
}: {
  readonly paper: AgentPaper
  readonly index: number
  readonly openState: PaperOpenState
  readonly onOpenInReader: (paper: AgentPaper) => void
}): JSX.Element {
  const meta = [paper.authors.slice(0, 3).join(", "), paper.year ?? "n.d.", paper.venue]
    .filter((part) => part !== "")
    .join(" · ")
  const relevance = paper.relevance === undefined ? null : relevanceLabels[paper.relevance]
  return (
    <article className="research-paper">
      <header>
        <span className="research-paper-provider">
          <span className="research-paper-index">[{index}]</span> {paper.provider}
        </span>
        <span className="research-paper-badges">
          {relevance ? (
            <span className={`research-paper-relevance research-relevance-${paper.relevance}`}>
              {relevance}
            </span>
          ) : null}
          {paper.citationCount !== null ? (
            <span className="research-paper-cites">인용 {paper.citationCount}</span>
          ) : null}
        </span>
      </header>
      <h4 title={paper.title}>{paper.title}</h4>
      <p>{meta}</p>
      {paper.reason ? <p className="research-paper-reason">{paper.reason}</p> : null}
      <footer>
        <button
          type="button"
          className="research-paper-open"
          disabled={!paper.fullTextUrl || openState === "importing"}
          onClick={() => onOpenInReader(paper)}
        >
          <BookOpen size={13} aria-hidden="true" />
          {openState === "importing" ? "가져오는 중…" : "리더에서 열기"}
        </button>
        {paper.landingUrl ? (
          <a
            href={paper.landingUrl}
            target="_blank"
            rel="noreferrer"
            className="research-paper-site"
          >
            <ExternalLink size={12} aria-hidden="true" />
            원문 사이트
          </a>
        ) : null}
        {openState === "failed" ? (
          <span className="research-paper-failed" role="alert">
            가져오지 못했습니다
          </span>
        ) : null}
      </footer>
    </article>
  )
}
