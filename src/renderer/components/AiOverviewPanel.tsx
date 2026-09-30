import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import type { AiHistoryMessage, ProviderStatus } from "../../shared/ipc"
import type { DocumentInsight, DocumentInsightKind } from "../../shared/schemas"
import type { SourceCitation } from "../lib/chatCitations"
import { keywordEntries } from "../lib/keywordEntries"
import { useTranslator } from "../lib/locale"
import {
  OVERVIEW_ACTIONS,
  overviewRequestKey,
  overviewRequests,
  PAPER_LEVEL_TARGET,
} from "../lib/paperOverview"
import { paperOverviewContext, preparePaperContextForQuestion } from "../lib/pdfSearch"
import { researchMessages } from "../messages/research"
import type { AiDeltaHandler, AiRequestRunner, DocumentRecord } from "../types"
import { KeywordTags } from "./KeywordTags"
import { PaperDiscussion } from "./PaperDiscussion"
import { SidebarInsightSection } from "./SidebarInsightSection"

type InsightKey = DocumentInsightKind
/** A catalog key, read in the app's language when shown; empty when there is no error. */
type InsightError = "" | "overview.failed" | "overview.checkSettings"
type InsightState = {
  readonly value: string
  readonly loading: boolean
  readonly error: InsightError
}
type InsightRecord = Record<InsightKey, InsightState>

const initialState: InsightRecord = {
  keywords: { value: "", loading: false, error: "" },
  threeLines: { value: "", loading: false, error: "" },
  summary: { value: "", loading: false, error: "" },
}

const titleKeys = {
  keywords: "overview.keywords",
  threeLines: "overview.threeLines",
  summary: "overview.summary",
} as const satisfies Readonly<Record<InsightKey, keyof typeof researchMessages.ko>>
/** Bounds of aiHistoryMessageSchema; older turns and longer answers would be rejected. */
const maxHistoryEntries = 24
const maxHistoryCharacters = 4_000
const leadingInsightKeys: readonly InsightKey[] = ["keywords", "threeLines"]
const overviewInsightKeys: readonly InsightKey[] = [...leadingInsightKeys, "summary"]
const emptyCachedInsights: readonly DocumentInsight[] = []

/** Keywords read as tags once a term bullet arrives; until then the raw answer shows. */
function keywordView(value: string): JSX.Element | null {
  const entries = keywordEntries(value)
  return entries.length > 0 ? <KeywordTags entries={entries} /> : null
}

function recentHistory(history: readonly AiHistoryMessage[]): AiHistoryMessage[] {
  return history.slice(-maxHistoryEntries).map((message) => ({
    role: message.role,
    content: message.content.slice(0, maxHistoryCharacters),
  }))
}

function mergeCachedInsights(
  current: InsightRecord,
  cached: readonly DocumentInsight[],
): InsightRecord {
  let next = current
  for (const insight of cached) {
    const state = current[insight.kind]
    if (state.value === insight.value && !state.loading && !state.error) continue
    if (next === current) next = { ...current }
    next[insight.kind] = { value: insight.value, loading: false, error: "" }
  }
  return next
}

export function AiOverviewPanel({
  document,
  currentPage,
  provider,
  onAiRequest,
  onSave,
  cachedInsights = emptyCachedInsights,
  onInsightChange,
  onNavigateToSource,
}: {
  readonly document: DocumentRecord
  readonly currentPage: number
  readonly provider: ProviderStatus
  readonly onAiRequest: AiRequestRunner
  /** `sourceTitle` is the Korean title, which names the insight in every language. */
  readonly onSave: (title: string, body: string, sourceTitle: string) => void
  readonly cachedInsights?: readonly DocumentInsight[] | undefined
  readonly onInsightChange?: ((kind: DocumentInsightKind, value: string) => void) | undefined
  readonly activationToken?: number | undefined
  readonly onNavigateToSource?: ((citation: SourceCitation) => void) | undefined
}): JSX.Element {
  const t = useTranslator(researchMessages)
  const running = useRef(new Set<InsightKey>())
  const [insights, setInsights] = useState(() => mergeCachedInsights(initialState, cachedInsights))
  const insightsRef = useRef(insights)
  useEffect(() => {
    insightsRef.current = insights
  }, [insights])
  useEffect(() => {
    setInsights((current) => {
      const next = mergeCachedInsights(current, cachedInsights)
      insightsRef.current = next
      return next
    })
  }, [cachedInsights])

  const generate = useCallback(
    async (key: InsightKey): Promise<void> => {
      if (running.current.has(key)) return
      running.current.add(key)
      setInsights((current) => ({
        ...current,
        [key]: { value: "", loading: true, error: "" },
      }))
      try {
        const requestKey = overviewRequestKey(document.id, key)
        const activeRequest = overviewRequests.get(requestKey)
        const request =
          activeRequest ??
          (() => {
            const source = paperOverviewContext() || document.overview || document.title
            return onAiRequest(
              {
                action: OVERVIEW_ACTIONS[key],
                page: 1,
                quote: PAPER_LEVEL_TARGET,
                paperContext: source,
                before: "",
                after: "",
              },
              (delta) =>
                setInsights((current) => ({
                  ...current,
                  [key]: { value: current[key].value + delta, loading: true, error: "" },
                })),
            )
          })()
        if (!activeRequest) overviewRequests.set(requestKey, request)
        const value = await request
        setInsights((current) => ({ ...current, [key]: { value, loading: false, error: "" } }))
        onInsightChange?.(key, value)
      } catch {
        setInsights((current) => ({
          ...current,
          [key]: {
            ...current[key],
            loading: false,
            error: provider.configured ? "overview.failed" : "overview.checkSettings",
          },
        }))
      } finally {
        overviewRequests.delete(overviewRequestKey(document.id, key))
        running.current.delete(key)
      }
    },
    [
      document.id,
      document.overview,
      document.title,
      onAiRequest,
      onInsightChange,
      provider.configured,
    ],
  )
  useEffect(() => {
    if (!provider.configured) return
    for (const key of overviewInsightKeys) {
      const insight = insightsRef.current[key]
      if (!insight.value && !insight.loading) void generate(key)
    }
  }, [generate, provider.configured])
  async function ask(
    question: string,
    history: readonly AiHistoryMessage[],
    onDelta?: AiDeltaHandler,
    signal?: AbortSignal,
    imageDataUrl?: string,
  ): Promise<string> {
    const evidence = await preparePaperContextForQuestion(
      document.id,
      question,
      currentPage,
      signal,
    )
    return onAiRequest(
      {
        action: "chat",
        page: currentPage,
        quote: question,
        ...(evidence
          ? {
              sourceEvidence: `Passages retrieved for this question:\n${evidence}`.slice(0, 12_000),
            }
          : {}),
        before: "",
        after: "",
        history: recentHistory(history),
        ...(imageDataUrl ? { imageDataUrl } : {}),
      },
      onDelta,
      signal,
    )
  }

  const errorText = (key: InsightKey): string => {
    const error = insights[key].error
    return error ? t(error) : ""
  }
  const save = (key: InsightKey): void =>
    onSave(t(titleKeys[key]), insights[key].value, researchMessages.ko[titleKeys[key]])

  return (
    <section className="sidebar-mode-panel ai-overview-panel" aria-label={t("overview.label")}>
      <div className="ai-overview-scroll">
        {leadingInsightKeys.map((key) => (
          <SidebarInsightSection
            key={key}
            title={t(titleKeys[key])}
            value={insights[key].value}
            loading={insights[key].loading}
            error={errorText(key)}
            onGenerate={() => void generate(key)}
            onSave={() => save(key)}
            view={key === "keywords" ? keywordView(insights.keywords.value) : null}
          />
        ))}
        <div className="summary-discussion-flow">
          <SidebarInsightSection
            title={t(titleKeys.summary)}
            value={insights.summary.value}
            loading={insights.summary.loading}
            error={errorText("summary")}
            onGenerate={() => void generate("summary")}
            onSave={() => save("summary")}
          />
          <PaperDiscussion
            provider={provider}
            documentId={document.id}
            onAsk={ask}
            onNavigateToSource={onNavigateToSource}
          />
        </div>
      </div>
    </section>
  )
}
