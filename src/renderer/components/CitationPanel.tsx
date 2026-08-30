import { Quote, ScanSearch } from "lucide-react"
import { type JSX, useMemo, useState } from "react"
import type { CitationAssessmentResult } from "../../shared/citationAssessment"
import type { AiRequest } from "../../shared/ipc"
import {
  citationAssessmentInput,
  citationLookupRequest,
  parseCitationAssessment,
  rankCitationAssessments,
} from "../lib/citationTriage"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import type { DocumentRecord } from "../types"
import { CitationItem } from "./CitationItem"
import type { CitationAnalysisState, CompleteCitationAnalysis } from "./citationPanelTypes"

export function CitationPanel({
  document,
  citations,
  onAiRequest,
  onSave,
}: {
  readonly document: DocumentRecord
  readonly citations: readonly CitationIndexEntry[]
  readonly onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>
  readonly onSave: (
    entry: CitationIndexEntry,
    state: CompleteCitationAnalysis,
    result: CitationAssessmentResult,
  ) => void
}): JSX.Element {
  const [states, setStates] = useState<Readonly<Record<string, CitationAnalysisState>>>({})
  const [batchRunning, setBatchRunning] = useState(false)
  const ranked = useMemo(
    () =>
      rankCitationAssessments(
        Object.entries(states).flatMap(([id, state]) =>
          state.status === "complete" ? [{ id, assessment: state.assessment }] : [],
        ),
      ),
    [states],
  )
  const rankById = useMemo(() => new Map(ranked.map((item) => [item.id, item] as const)), [ranked])
  const ordered = useMemo(
    () =>
      [...citations].sort((left, right) => {
        const leftRank = rankById.get(left.key)
        const rightRank = rankById.get(right.key)
        if (leftRank && rightRank) return rightRank.score - leftRank.score
        if (leftRank) return -1
        if (rightRank) return 1
        return right.contexts.length - left.contexts.length
      }),
    [citations, rankById],
  )

  async function analyze(entry: CitationIndexEntry): Promise<void> {
    setStates((current) => ({ ...current, [entry.key]: { status: "loading" } }))
    try {
      const lookup = await window.scourgify.lookupCitation(
        citationLookupRequest(entry, document.title),
      )
      if (lookup.status !== "found") {
        setStates((current) => ({
          ...current,
          [entry.key]: { status: "error", message: "검증 가능한 논문을 찾지 못했습니다." },
        }))
        return
      }
      const input = citationAssessmentInput(document.title, entry, lookup.paper, lookup.match)
      const text = await onAiRequest({
        action: "citation_assessment",
        page: entry.contexts[0]?.page ?? 1,
        quote: input,
        before: "",
        after: "",
        featureKind: "citation",
      })
      const assessment = parseCitationAssessment(text)
      setStates((current) => ({
        ...current,
        [entry.key]: {
          status: "complete",
          paper: lookup.paper,
          match: lookup.match,
          assessment,
        },
      }))
    } catch {
      setStates((current) => ({
        ...current,
        [entry.key]: { status: "error", message: "메타데이터 또는 AI 판독에 실패했습니다." },
      }))
    }
  }

  async function analyzeAll(): Promise<void> {
    if (batchRunning) return
    setBatchRunning(true)
    for (let index = 0; index < citations.length; index += 3) {
      await Promise.all(citations.slice(index, index + 3).map(analyze))
    }
    setBatchRunning(false)
  }

  async function ask(entry: CitationIndexEntry, question: string): Promise<string> {
    const state = states[entry.key]
    if (state?.status !== "complete") throw new Error("citation is not verified")
    return onAiRequest({
      action: "citation_chat",
      page: entry.contexts[0]?.page ?? 1,
      quote: question,
      before: citationAssessmentInput(document.title, entry, state.paper, state.match),
      after: "",
      featureKind: "citation",
    })
  }

  return (
    <section className="sidebar-mode-panel citation-panel" aria-label="인용 논문 판독">
      <header className="mode-panel-head">
        <div>
          <Quote size={18} />
          <h2>인용</h2>
        </div>
        <button
          type="button"
          disabled={batchRunning || citations.length === 0}
          onClick={() => void analyzeAll()}
        >
          <ScanSearch size={14} /> {batchRunning ? "판독 중" : "전체 판독"}
        </button>
      </header>
      <p className="citation-policy">정독 5% · 훑어보기 15% · 초록만 25% · 패스 다수</p>
      {ordered.length > 0 ? (
        <div className="citation-list">
          {ordered.map((entry) => {
            const state = states[entry.key]
            return (
              <CitationItem
                key={entry.key}
                entry={entry}
                state={state}
                ranked={rankById.get(entry.key)}
                onAnalyze={() => void analyze(entry)}
                onSave={(result) => {
                  if (state?.status === "complete") onSave(entry, state, result)
                }}
                onAsk={(question) => ask(entry, question)}
              />
            )
          })}
        </div>
      ) : (
        <p className="mode-empty">이 PDF에서 구조화된 참고문헌을 찾지 못했습니다.</p>
      )}
    </section>
  )
}
