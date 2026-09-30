import { BookmarkPlus, Search, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type { MessageParams } from "../../shared/i18n/locale"
import type {
  ScholarlyProviderState,
  ScholarlySearchItem,
  ScholarlySearchResult,
  ScholarlySearchStep,
} from "../../shared/scholarlySearchSchemas"
import {
  ScholarlySearchStreamError,
  scholarlySearchStream,
} from "../../web/localScholarlySearchStream"
import { useTranslator } from "../lib/locale"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { rankForUserQuery } from "../lib/scholarlyQueryRanking"
import {
  rankScholarlyRecommendations,
  scholarlyQueryForDocument,
  scholarlySearchBasis,
} from "../lib/scholarlySearchRelevance"
import { scholarMessages } from "../messages/scholar"
import type { DocumentRecord } from "../types"
import { providerErrorLabel, ScholarSearchSteps, upsertStep } from "./ScholarSearchSteps"

const providerLabels: Readonly<Record<ScholarlyProviderState["provider"], string>> = {
  crossref: "Crossref",
  arxiv: "arXiv",
  openalex: "OpenAlex",
}

type SearchPhase = "idle" | "loading" | "cancelled"
type SaveState =
  | { readonly status: "saving" }
  | { readonly status: "saved" | "duplicate" }
  | { readonly status: "error"; readonly message: string }

function providerStateLabel(
  state: ScholarlyProviderState,
  t: (key: keyof typeof scholarMessages.ko, params?: MessageParams) => string,
): string {
  const name = providerLabels[state.provider]
  if (state.status === "success") {
    return state.freshness === "cached"
      ? t("scholar.providerCountCached", { name, count: state.resultCount })
      : t("scholar.providerCount", { name, count: state.resultCount })
  }
  return t("scholar.providerError", { name, error: providerErrorLabel(t, state.error.kind) })
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
  const t = useTranslator(scholarMessages)
  const [result, setResult] = useState<ScholarlySearchResult | null>(null)
  const [phase, setPhase] = useState<SearchPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState<string | null>(null)
  const [decisionChoice, setDecisionChoice] = useState<string | null>(null)
  const [saveStates, setSaveStates] = useState<Readonly<Record<string, SaveState>>>({})
  const [steps, setSteps] = useState<readonly ScholarlySearchStep[]>([])
  const controllerRef = useRef<AbortController | null>(null)
  const query = scholarlyQueryForDocument(document, citations)
  const basis = scholarlySearchBasis(document, citations)
  const [searchQuery, setSearchQuery] = useState(query ?? "")
  // A query the user typed is ranked on its own terms; the document's suggested query keeps
  // the stricter "related to this paper" filter.
  const [customQuery, setCustomQuery] = useState<string | null>(null)
  const rank = (items: ScholarlySearchResult["results"], typed: string | null) =>
    typed === null
      ? rankScholarlyRecommendations(document, citations, items)
      : rankForUserQuery(typed, items, document)
  const recommendations = result ? rank(result.results, customQuery) : []
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
      setError(t("scholar.emptyQuery"))
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
    setSteps([])
    const typed = activeQuery === (query ?? "").trim() ? null : activeQuery
    setCustomQuery(typed)
    const pushStep = (step: ScholarlySearchStep): void => {
      if (!controller.signal.aborted) setSteps((current) => upsertStep(current, step))
    }
    try {
      const data = await scholarlySearchStream(
        { query: activeQuery, pageSize: 25 },
        pushStep,
        controller.signal,
      )
      pushStep({ id: "rank", kind: "rank", status: "running" })
      const ranked = rank(data.results, typed)
      pushStep({ id: "rank", kind: "rank", status: "done", found: ranked.length })
      const decideAi = window.ohmypaper?.decideAi
      if (decideAi && ranked.length > 1) {
        const candidateCount = Math.min(ranked.length, 8)
        pushStep({ id: "judge", kind: "judge", status: "running", found: candidateCount })
        try {
          const decision = await decideAi(
            {
              task: "relevance",
              text: activeQuery,
              candidates: ranked.slice(0, 8).map(({ item }, index) => ({
                id: `candidate-${index}`,
                text: `${item.title}\n${item.abstract ?? ""}`.slice(0, 8_000),
              })),
              instructions:
                typed === null
                  ? "Choose the most relevant paper for the current document."
                  : "Choose the paper that best matches the search query.",
            },
            controller.signal,
          )
          if (decision.choiceId === "none" || decision.choiceId === "unknown") {
            setDecisionNote(t("scholar.defaultOrder"))
            pushStep({
              id: "judge",
              kind: "judge",
              status: "done",
              found: candidateCount,
              detail: t("scholar.judgeNone"),
            })
          } else {
            const index = Number.parseInt(decision.choiceId.replace("candidate-", ""), 10)
            const chosen = ranked[index]
            setDecisionChoice(chosen?.item.title ?? null)
            const note = chosen
              ? t("scholar.judgeChosen", { title: chosen.item.title })
              : t("scholar.defaultOrder")
            setDecisionNote(note)
            pushStep({
              id: "judge",
              kind: "judge",
              status: "done",
              found: candidateCount,
              detail: note.slice(0, 500),
            })
          }
        } catch (cause) {
          if (controller.signal.aborted) throw cause
          const note =
            cause instanceof Error
              ? t("scholar.judgeUnavailableReason", { reason: cause.message })
              : t("scholar.judgeUnavailable")
          setDecisionNote(note)
          pushStep({
            id: "judge",
            kind: "judge",
            status: "failed",
            found: candidateCount,
            detail: note.slice(0, 500),
          })
        }
      } else {
        setDecisionNote(t("scholar.ruleBased"))
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
      if (cause instanceof ScholarlySearchStreamError) {
        setError(
          cause.kind === "request_failed"
            ? t("scholar.requestFailed", {
                status: cause.status ?? t("scholar.connectionFailed"),
                message: cause.message,
              })
            : t("scholar.searchError", { message: cause.message }),
        )
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
    const discovery = window.ohmypaper?.discovery
    if (!discovery) {
      setSaveStates((current) => ({
        ...current,
        [key]: {
          status: "error",
          message: t("scholar.saveUnavailable"),
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

  const title = phase === "idle" && !result ? t("scholar.titleFind") : t("scholar.titleRelated")
  return (
    <section className="scholar-search-panel" aria-label={t("scholar.panelLabel")}>
      <header className="scholar-search-header">
        <div>
          <h2 className="scholar-search-heading">{title}</h2>
          <label className="scholar-search-query" htmlFor="scholar-search-query">
            {searchQuery.trim() !== (query ?? "").trim()
              ? t("scholar.basis.query")
              : basis === "title"
                ? t("scholar.basis.title")
                : basis === "doi"
                  ? t("scholar.basis.doi")
                  : basis === "topic"
                    ? t("scholar.basis.topic")
                    : t("scholar.basis.query")}
            <input
              id="scholar-search-query"
              aria-label={t("scholar.queryInput")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("scholar.placeholder")}
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
            {phase === "loading" ? t("scholar.searching") : t("scholar.search")}
          </button>
          {phase === "loading" ? (
            <button type="button" onClick={cancel} aria-label={t("scholar.cancelLabel")}>
              <X aria-hidden="true" size={14} /> {t("scholar.cancel")}
            </button>
          ) : null}
        </div>
      </header>
      {phase === "loading" && steps.length > 0 ? (
        <ScholarSearchSteps steps={steps} />
      ) : steps.length > 0 ? (
        <details className="scholar-search-log">
          <summary>{t("scholar.log")}</summary>
          <ScholarSearchSteps steps={steps} />
        </details>
      ) : null}
      {error ? (
        <p className="scholar-search-error" role="alert">
          {error}
        </p>
      ) : null}
      {phase === "cancelled" ? (
        <p className="scholar-search-providers" role="status">
          {t("scholar.cancelled")}
        </p>
      ) : null}
      {result && (result.status === "failed" || result.status === "cancelled") ? (
        <div>
          <p className="scholar-search-error" role="alert">
            {result.status === "cancelled" ? t("scholar.cancelled") : t("scholar.failed")}
          </p>
          <p className="scholar-search-providers">
            {result.providers.map((state) => providerStateLabel(state, t)).join(" · ")}
          </p>
        </div>
      ) : null}
      {result && result.status !== "failed" && result.status !== "cancelled" ? (
        <>
          {result.status === "partial" || decisionNote ? (
            <p className="scholar-search-providers">
              {result.status === "partial"
                ? result.providers.map((state) => providerStateLabel(state, t)).join(" · ")
                : null}
              {result.status === "partial" && decisionNote ? " · " : null}
              {decisionNote}
            </p>
          ) : null}
          {recommendations.length === 0 ? (
            <p className="mode-empty">
              {customQuery === null ? t("scholar.emptyRelated") : t("scholar.emptyResults")}
            </p>
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
                          ? t("scholar.saved")
                          : saveState?.status === "duplicate"
                            ? t("scholar.duplicate")
                            : t("scholar.saveMetadata")}
                      </button>
                    </div>
                    <p className="scholar-search-meta">
                      {item.authors.slice(0, 3).join(", ")}
                      {item.authors.length > 3 ? ` ${t("scholar.etAl")}` : ""} ·{" "}
                      {item.year ?? t("scholar.unknownYear")} · {item.venue || item.provider}
                    </p>
                    <p className="scholar-search-reason">
                      {t("scholar.reasons", { reasons: reasons.join(" · ") })}
                    </p>
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
