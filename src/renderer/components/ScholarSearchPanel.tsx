import { BookmarkPlus, Search, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type {
  ScholarlyProviderState,
  ScholarlySearchItem,
  ScholarlySearchResult,
} from "../../shared/scholarlySearchSchemas"
import { scholarlySearchResultSchema } from "../../shared/scholarlySearchSchemas"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import {
  rankScholarlyRecommendations,
  scholarlyQueryForDocument,
  scholarlySearchBasis,
} from "../lib/scholarlySearchRelevance"
import type { DocumentRecord } from "../types"

const providerLabels: Readonly<Record<ScholarlyProviderState["provider"], string>> = {
  crossref: "Crossref",
  arxiv: "arXiv",
  openalex: "OpenAlex",
}

const providerErrorLabels: Readonly<Record<string, string>> = {
  rate_limited: "요청 한도 초과",
  timeout: "시간 초과",
  oversized: "응답 초과",
  cancelled: "취소됨",
  network: "네트워크 오류",
  http_error: "HTTP 오류",
  malformed_response: "응답 형식 오류",
}

type SearchPhase = "idle" | "loading" | "cancelled"
type SaveState =
  | { readonly status: "saving" }
  | { readonly status: "saved" | "duplicate" }
  | { readonly status: "error"; readonly message: string }

class ScholarSearchRequestError extends Error {
  readonly name = "ScholarSearchRequestError"

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function providerStateLabel(state: ScholarlyProviderState): string {
  const name = providerLabels[state.provider]
  if (state.status === "success") {
    return `${name} ${state.resultCount}건${state.freshness === "cached" ? "(캐시)" : ""}`
  }
  const kind = providerErrorLabels[state.error.kind] ?? state.error.kind
  return `${name} ${kind}`
}

function itemKey(item: ScholarlySearchItem): string {
  return `${item.provider}:${item.identity.providerRecordId}`
}

export function ScholarSearchPanel({
  document,
  citations = [],
}: {
  readonly document: DocumentRecord
  readonly citations?: readonly CitationIndexEntry[]
}): JSX.Element {
  const [result, setResult] = useState<ScholarlySearchResult | null>(null)
  const [phase, setPhase] = useState<SearchPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState<string | null>(null)
  const [decisionChoice, setDecisionChoice] = useState<string | null>(null)
  const [saveStates, setSaveStates] = useState<Readonly<Record<string, SaveState>>>({})
  const controllerRef = useRef<AbortController | null>(null)
  const query = scholarlyQueryForDocument(document, citations)
  const basis = scholarlySearchBasis(document, citations)
  const [searchQuery, setSearchQuery] = useState(query ?? "")
  const recommendations = result
    ? rankScholarlyRecommendations(document, citations, result.results)
    : []
  const orderedRecommendations = [...recommendations].sort((left, right) => {
    if (decisionChoice === null) return 0
    if (left.item.title === decisionChoice) return -1
    if (right.item.title === decisionChoice) return 1
    return 0
  })

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  async function search(): Promise<void> {
    if (phase === "loading") return
    const activeQuery = searchQuery.trim()
    if (!activeQuery) {
      setError("검색어가 없어 검색할 수 없습니다.")
      return
    }
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setPhase("loading")
    setError(null)
    setDecisionNote(null)
    setDecisionChoice(null)
    setResult(null)
    try {
      const response = await fetch("/api/rpc/scholarlySearch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: activeQuery, pageSize: 25 }),
        signal: controller.signal,
      })
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const body: unknown = await response.json()
          if (typeof body === "object" && body !== null && "error" in body) {
            const value = body.error
            if (typeof value === "string" && value.length > 0) message = value
          }
        } catch (cause) {
          if (!(cause instanceof SyntaxError)) throw cause
        }
        throw new ScholarSearchRequestError(response.status, message)
      }
      const data = scholarlySearchResultSchema.parse(await response.json())
      const ranked = rankScholarlyRecommendations(document, citations, data.results)
      const decideAi = window.scourgify?.decideAi
      if (decideAi && ranked.length > 1) {
        try {
          const decision = await decideAi(
            {
              task: "relevance",
              text: activeQuery,
              candidates: ranked.slice(0, 8).map(({ item }, index) => ({
                id: `candidate-${index}`,
                text: `${item.title}\n${item.abstract ?? ""}`.slice(0, 8_000),
              })),
              instructions: "Choose the most relevant paper for the current document.",
            },
            controller.signal,
          )
          if (decision.choiceId === "none" || decision.choiceId === "unknown") {
            setDecisionNote("기본 규칙으로 추천을 정렬했습니다.")
          } else {
            const index = Number.parseInt(decision.choiceId.replace("candidate-", ""), 10)
            const chosen = ranked[index]
            setDecisionChoice(chosen?.item.title ?? null)
            setDecisionNote(
              chosen ? `Jev 보조 판정: ${chosen.item.title}` : "기본 규칙으로 추천을 정렬했습니다.",
            )
          }
        } catch (cause) {
          if (controller.signal.aborted) throw cause
          setDecisionNote(
            cause instanceof Error
              ? `Jev 보조 판정을 사용할 수 없어 기본 규칙을 적용했습니다: ${cause.message}`
              : "Jev 보조 판정을 사용할 수 없어 기본 규칙을 적용했습니다.",
          )
        }
      } else {
        setDecisionNote("규칙 기반 추천")
      }
      if (!controller.signal.aborted) {
        setResult(data)
        setPhase("idle")
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        setPhase("cancelled")
        return
      }
      if (cause instanceof ScholarSearchRequestError) {
        setError(`검색 요청에 실패했습니다 (${cause.status}): ${cause.message}`)
      } else if (cause instanceof Error) {
        setError(cause.message)
      } else {
        throw cause
      }
      setPhase("idle")
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  function cancel(): void {
    controllerRef.current?.abort()
    controllerRef.current = null
    setPhase("cancelled")
  }

  async function save(item: ScholarlySearchItem): Promise<void> {
    const key = itemKey(item)
    const discovery = window.scourgify?.discovery
    if (!discovery) {
      setSaveStates((current) => ({
        ...current,
        [key]: {
          status: "error",
          message: "이 브라우저에서는 라이브러리 저장을 사용할 수 없습니다.",
        },
      }))
      return
    }
    setSaveStates((current) => ({ ...current, [key]: { status: "saving" } }))
    try {
      const saved = await discovery.saveMetadata({ item })
      setSaveStates((current) => ({
        ...current,
        [key]: { status: saved.status === "duplicate" ? "duplicate" : "saved" },
      }))
    } catch (cause) {
      if (cause instanceof Error) {
        setSaveStates((current) => ({
          ...current,
          [key]: { status: "error", message: cause.message },
        }))
        return
      }
      throw cause
    }
  }

  const title = phase === "idle" && !result ? "논문 탐색" : "관련 논문"
  return (
    <section className="scholar-search-panel" aria-label="관련 논문 탐색">
      <header className="scholar-search-header">
        <div>
          <h2 className="scholar-search-heading">{title}</h2>
          <label className="scholar-search-query" htmlFor="scholar-search-query">
            {basis === "title"
              ? "확인된 제목"
              : basis === "doi"
                ? "확인된 DOI"
                : basis === "topic"
                  ? "본문·참고문헌 주제"
                  : "검색어"}
            <input
              id="scholar-search-query"
              aria-label="관련 논문 검색어"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="검색어를 입력하세요"
            />
          </label>
        </div>
        <div className="scholar-search-actions">
          <button
            type="button"
            onClick={() => void search()}
            disabled={phase === "loading" || searchQuery.trim().length === 0}
          >
            <Search aria-hidden="true" size={14} />
            {phase === "loading" ? "검색 중" : "검색 실행"}
          </button>
          {phase === "loading" ? (
            <button type="button" onClick={cancel} aria-label="논문 검색 취소">
              <X aria-hidden="true" size={14} /> 취소
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <p className="scholar-search-error" role="alert">
          {error}
        </p>
      ) : null}
      {phase === "cancelled" ? (
        <p className="scholar-search-providers" role="status">
          검색이 취소되었습니다.
        </p>
      ) : null}
      {result && (result.status === "failed" || result.status === "cancelled") ? (
        <div>
          <p className="scholar-search-error" role="alert">
            {result.status === "cancelled" ? "검색이 취소되었습니다." : "검색에 실패했습니다."}
          </p>
          <p className="scholar-search-providers">
            {result.providers.map(providerStateLabel).join(" · ")}
          </p>
        </div>
      ) : null}
      {result && result.status !== "failed" && result.status !== "cancelled" ? (
        <>
          {result.status === "partial" || decisionNote ? (
            <p className="scholar-search-providers">
              {result.status === "partial"
                ? result.providers.map(providerStateLabel).join(" · ")
                : null}
              {result.status === "partial" && decisionNote ? " · " : null}
              {decisionNote}
            </p>
          ) : null}
          {recommendations.length === 0 ? (
            <p className="mode-empty">현재 논문과 겹치는 확인 가능한 관련 결과가 없습니다.</p>
          ) : (
            <ul className="scholar-search-list">
              {orderedRecommendations.map(({ item, reasons }) => {
                const key = itemKey(item)
                const saveState = saveStates[key]
                return (
                  <li key={key} className="scholar-search-item">
                    <div className="scholar-search-item-head">
                      <a
                        href={item.landingUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="scholar-search-title"
                      >
                        {item.title}
                      </a>
                      <button
                        type="button"
                        onClick={() => void save(item)}
                        disabled={saveState?.status === "saving"}
                      >
                        <BookmarkPlus aria-hidden="true" size={14} />
                        {saveState?.status === "saved"
                          ? "저장됨"
                          : saveState?.status === "duplicate"
                            ? "이미 저장됨"
                            : "메타데이터 저장"}
                      </button>
                    </div>
                    <p className="scholar-search-meta">
                      {item.authors.slice(0, 3).join(", ")}
                      {item.authors.length > 3 ? " 외" : ""} · {item.year ?? "연도 미상"} ·{" "}
                      {item.venue || item.provider}
                    </p>
                    <p className="scholar-search-reason">추천 근거: {reasons.join(" · ")}</p>
                    {saveState?.status === "error" ? (
                      <p className="scholar-search-error" role="alert">
                        {saveState.message}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  )
}
