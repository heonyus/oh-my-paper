import { Sparkles } from "lucide-react"
import { type JSX, useState } from "react"
import type { AiAction, AiHistoryMessage, AiRequest, ProviderStatus } from "../../shared/ipc"
import { paperContextForQuestion, paperOverviewContext } from "../lib/pdfSearch"
import type { DocumentRecord } from "../types"
import { PaperDiscussion } from "./PaperDiscussion"
import { SidebarInsightSection } from "./SidebarInsightSection"

type InsightKey = "keywords" | "threeLines" | "summary"
type InsightState = { readonly value: string; readonly loading: boolean; readonly error: string }

const initialState: Readonly<Record<InsightKey, InsightState>> = {
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
const insightKeys: readonly InsightKey[] = ["keywords", "threeLines", "summary"]

export function AiOverviewPanel({
  document,
  currentPage,
  provider,
  onAiRequest,
  onSave,
}: {
  readonly document: DocumentRecord
  readonly currentPage: number
  readonly provider: ProviderStatus
  readonly onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>
  readonly onSave: (title: string, body: string) => void
}): JSX.Element {
  const [insights, setInsights] = useState(initialState)

  async function generate(key: InsightKey): Promise<void> {
    setInsights((current) => ({
      ...current,
      [key]: { ...current[key], loading: true, error: "" },
    }))
    try {
      const value = await onAiRequest({
        action: config[key].action,
        page: 1,
        quote: paperOverviewContext(),
        before: `Paper: ${document.title}`,
        after: "",
      })
      setInsights((current) => ({ ...current, [key]: { value, loading: false, error: "" } }))
    } catch {
      setInsights((current) => ({
        ...current,
        [key]: { ...current[key], loading: false, error: "AI 설정을 확인해주세요." },
      }))
    }
  }

  async function ask(question: string, history: readonly AiHistoryMessage[]): Promise<string> {
    return onAiRequest({
      action: "chat",
      page: currentPage,
      quote: question,
      before: `Paper: ${document.title}\n${paperContextForQuestion(question, currentPage)}`,
      after: "",
      history: [...history],
    })
  }

  return (
    <section className="sidebar-mode-panel ai-overview-panel" aria-label="AI 논문 개요">
      <header className="mode-panel-head">
        <div>
          <Sparkles size={18} />
          <h2>With AI</h2>
        </div>
        <span>명시적 실행</span>
      </header>
      <div className="ai-overview-scroll">
        {insightKeys.map((key) => (
          <SidebarInsightSection
            key={key}
            title={config[key].title}
            value={insights[key].value}
            loading={insights[key].loading}
            error={insights[key].error}
            onGenerate={() => void generate(key)}
            onSave={() => onSave(config[key].title, insights[key].value)}
          />
        ))}
        <PaperDiscussion provider={provider} onAsk={ask} />
      </div>
    </section>
  )
}
