import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import type { AiAction, AiHistoryMessage, ProviderStatus } from "../../shared/ipc"
import type { DocumentInsight, DocumentInsightKind } from "../../shared/schemas"
import type { SourceCitation } from "../lib/chatCitations"
import { keywordEntries } from "../lib/keywordEntries"
import { paperOverviewContext, preparePaperContextForQuestion } from "../lib/pdfSearch"
import type { AiDeltaHandler, AiRequestRunner, DocumentRecord } from "../types"
import { KeywordTags } from "./KeywordTags"
import { PaperDiscussion } from "./PaperDiscussion"
import { SidebarInsightSection } from "./SidebarInsightSection"

type InsightKey = DocumentInsightKind
type InsightState = { readonly value: string; readonly loading: boolean; readonly error: string }
type InsightRecord = Record<InsightKey, InsightState>

const initialState: InsightRecord = {
  keywords: { value: "", loading: false, error: "" },
  threeLines: { value: "", loading: false, error: "" },
  summary: { value: "", loading: false, error: "" },
}

const config: Readonly<Record<InsightKey, { readonly title: string; readonly action: AiAction }>> =
  {
    keywords: { title: "키워드 사전", action: "keywords" },
    threeLines: { title: "3줄 요약", action: "three_line_summary" },
    summary: { title: "요약", action: "paper_summary" },
  }
/** The request runner supplies the whole paper as PAPER_CONTEXT for these actions. */
const paperLevelTarget = "The whole paper supplied in PAPER_CONTEXT."
/** Bounds of aiHistoryMessageSchema; older turns and longer answers would be rejected. */
const maxHistoryEntries = 24
const maxHistoryCharacters = 4_000
const leadingInsightKeys: readonly InsightKey[] = ["keywords", "threeLines"]
const overviewInsightKeys: readonly InsightKey[] = [...leadingInsightKeys, "summary"]
const overviewRequests = new Map<string, Promise<string>>()
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
  readonly onSave: (title: string, body: string) => void
  readonly cachedInsights?: readonly DocumentInsight[] | undefined
  readonly onInsightChange?: ((kind: DocumentInsightKind, value: string) => void) | undefined
  readonly activationToken?: number | undefined
  readonly onNavigateToSource?: ((citation: SourceCitation) => void) | undefined
}): JSX.Element {
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
        const requestKey = `${document.id}:${key}`
        const activeRequest = overviewRequests.get(requestKey)
        const request =
          activeRequest ??
          (() => {
            const source = paperOverviewContext() || document.overview || document.title
            return onAiRequest(
              {
                action: config[key].action,
                page: 1,
                quote: paperLevelTarget,
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
            error: provider.configured
              ? "요청을 완료하지 못했습니다. 다시 시도해주세요."
              : "AI 설정을 확인해주세요.",
          },
        }))
      } finally {
        overviewRequests.delete(`${document.id}:${key}`)
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

  return (
    <section className="sidebar-mode-panel ai-overview-panel" aria-label="AI 논문 개요">
      <div className="ai-overview-scroll">
        {leadingInsightKeys.map((key) => (
          <SidebarInsightSection
            key={key}
            title={config[key].title}
            value={insights[key].value}
            loading={insights[key].loading}
            error={insights[key].error}
            onGenerate={() => void generate(key)}
            onSave={() => onSave(config[key].title, insights[key].value)}
            view={key === "keywords" ? keywordView(insights.keywords.value) : null}
          />
        ))}
        <div className="summary-discussion-flow">
          <SidebarInsightSection
            title={config.summary.title}
            value={insights.summary.value}
            loading={insights.summary.loading}
            error={insights.summary.error}
            onGenerate={() => void generate("summary")}
            onSave={() => onSave(config.summary.title, insights.summary.value)}
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
