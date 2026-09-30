import { BookOpen, ExternalLink } from "lucide-react"
import type { JSX } from "react"
import { useTranslator } from "../../renderer/lib/locale"
import type { AgentPaper } from "../../shared/agentChat"
import { researchViewMessages } from "./messages"

export type PaperOpenState = "idle" | "importing" | "failed"

const relevanceKeys: Readonly<Record<number, keyof typeof researchViewMessages.ko>> = {
  3: "paper.relevance.3",
  2: "paper.relevance.2",
  1: "paper.relevance.1",
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
  const t = useTranslator(researchViewMessages)
  const meta = [paper.authors.slice(0, 3).join(", "), paper.year ?? "n.d.", paper.venue]
    .filter((part) => part !== "")
    .join(" · ")
  const relevanceKey = paper.relevance === undefined ? undefined : relevanceKeys[paper.relevance]
  const relevance = relevanceKey ? t(relevanceKey) : null
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
            <span className="research-paper-cites">
              {t("paper.citedBy", { count: paper.citationCount })}
            </span>
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
          {openState === "importing" ? t("paper.importing") : t("paper.open")}
        </button>
        {paper.landingUrl ? (
          <a
            href={paper.landingUrl}
            target="_blank"
            rel="noreferrer"
            className="research-paper-site"
          >
            <ExternalLink size={12} aria-hidden="true" />
            {t("paper.site")}
          </a>
        ) : null}
        {openState === "failed" ? (
          <span className="research-paper-failed" role="alert">
            {t("paper.importFailed")}
          </span>
        ) : null}
      </footer>
    </article>
  )
}
