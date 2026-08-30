import {
  ChevronLeft,
  Highlighter,
  Languages,
  MessageSquareText,
  NotebookPen,
  Palette,
  PanelRightClose,
  Quote,
  Sparkles,
  StickyNote,
} from "lucide-react"
import { type JSX, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import type { DocumentInsight, DocumentInsightKind } from "../../shared/schemas"
import { researchSidebarLayout } from "../../shared/uiLayout"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { saveCitationAssessment, saveSidebarInsight } from "../lib/sidebarCards"
import type { AiRequestRunner, BoardCard, CardId, DocumentRecord } from "../types"
import { AiOverviewPanel } from "./AiOverviewPanel"
import { BoardIndexPanel } from "./BoardIndexPanel"
import { CitationPanel } from "./CitationPanel"
import { SidebarResizeHandle } from "./SidebarResizeHandle"

type CardMode = Exclude<BoardCard["kind"], "citation">
type ResearchMode = "ai" | "citations" | CardMode

const cardModeLabels: Readonly<Record<CardMode, string>> = {
  translation: "번역",
  explanation: "AI 설명",
  infographic: "AI 카드",
  note: "노트",
  sticky: "포스트잇",
  highlight: "하이라이트",
}

function isCardMode(mode: ResearchMode): mode is CardMode {
  return mode !== "ai" && mode !== "citations"
}

export function ResearchSidebar({
  document,
  currentPage,
  cards,
  citations,
  expanded,
  provider,
  onToggle,
  onJumpToCard,
  onCardsChange,
  onAiRequest,
  width = researchSidebarLayout.contentDefault,
  onWidthChange,
  insights = [],
  onInsightChange,
}: {
  readonly document: DocumentRecord | null
  readonly currentPage: number
  readonly cards: readonly BoardCard[]
  readonly citations: readonly CitationIndexEntry[]
  readonly expanded: boolean
  readonly provider: ProviderStatus
  readonly onToggle: () => void
  readonly onJumpToCard: (id: CardId) => void
  readonly onCardsChange: (cards: readonly BoardCard[]) => void
  readonly onAiRequest: AiRequestRunner
  readonly width?: number | undefined
  readonly onWidthChange?: ((width: number) => void) | undefined
  readonly insights?: readonly DocumentInsight[] | undefined
  readonly onInsightChange?: ((kind: DocumentInsightKind, value: string) => void) | undefined
}): JSX.Element {
  const [mode, setMode] = useState<ResearchMode>("ai")
  const [aiActivationToken, setAiActivationToken] = useState(0)
  const [seenCounts, setSeenCounts] = useState<Partial<Record<ResearchMode, number>>>({})
  const modes: readonly {
    readonly id: ResearchMode
    readonly label: string
    readonly count?: number
    readonly icon: JSX.Element
  }[] = [
    { id: "ai", label: "AI", icon: <Sparkles size={18} /> },
    {
      id: "translation",
      label: "번역",
      count: cards.filter((card) => card.kind === "translation").length,
      icon: <Languages size={18} />,
    },
    {
      id: "explanation",
      label: "AI 설명",
      count: cards.filter((card) => card.kind === "explanation").length,
      icon: <MessageSquareText size={18} />,
    },
    {
      id: "infographic",
      label: "AI 카드",
      count: cards.filter((card) => card.kind === "infographic").length,
      icon: <Palette size={18} />,
    },
    {
      id: "note",
      label: "노트",
      count: cards.filter((card) => card.kind === "note").length,
      icon: <NotebookPen size={18} />,
    },
    {
      id: "sticky",
      label: "포스트잇",
      count: cards.filter((card) => card.kind === "sticky").length,
      icon: <StickyNote size={18} />,
    },
    {
      id: "highlight",
      label: "하이라이트",
      count: cards.filter((card) => card.kind === "highlight").length,
      icon: <Highlighter size={18} />,
    },
    { id: "citations", label: "인용", count: citations.length, icon: <Quote size={18} /> },
  ]
  if (!expanded) {
    return (
      <aside className="research-sidebar is-collapsed" aria-label="연구 사이드바 접힘">
        <nav className="research-mode-rail">
          <button type="button" onClick={onToggle} aria-label="연구 사이드바 펼치기">
            <ChevronLeft size={18} />
          </button>
        </nav>
      </aside>
    )
  }
  return (
    <aside
      className="research-sidebar"
      aria-label="연구 사이드바"
      style={{
        width: width + researchSidebarLayout.railWidth,
        minWidth: width + researchSidebarLayout.railWidth,
        gridTemplateColumns: `${width}px ${researchSidebarLayout.railWidth}px`,
      }}
    >
      {onWidthChange ? (
        <SidebarResizeHandle
          label="연구 사이드바 너비 조절"
          width={width}
          minimum={researchSidebarLayout.contentMinimum}
          maximum={researchSidebarLayout.contentMaximum}
          edge="start"
          onWidthChange={onWidthChange}
        />
      ) : null}
      <div className="research-sidebar-content">
        {!document ? (
          <p className="mode-empty">열려 있는 논문이 없습니다.</p>
        ) : mode === "ai" ? (
          <AiOverviewPanel
            key={document.id}
            document={document}
            currentPage={currentPage}
            provider={provider}
            onAiRequest={onAiRequest}
            cachedInsights={insights}
            onInsightChange={onInsightChange}
            activationToken={aiActivationToken}
            onSave={(title, body) =>
              onCardsChange(saveSidebarInsight(cards, document, title, body))
            }
          />
        ) : isCardMode(mode) ? (
          <BoardIndexPanel
            cards={cards}
            kind={mode}
            label={cardModeLabels[mode]}
            onJump={onJumpToCard}
          />
        ) : (
          <CitationPanel
            document={document}
            citations={citations}
            onAiRequest={onAiRequest}
            onSave={(entry, state, result) =>
              onCardsChange(saveCitationAssessment(cards, document, entry, state.paper, result))
            }
          />
        )}
      </div>
      <nav className="research-mode-rail" aria-label="연구 사이드바 모드">
        <button type="button" onClick={onToggle} aria-label="연구 사이드바 접기">
          <PanelRightClose size={18} />
        </button>
        <span className="mode-rail-divider" />
        {modes.map((item) => (
          <button
            type="button"
            key={item.id}
            data-active={mode === item.id}
            aria-pressed={mode === item.id}
            aria-label={item.id === "ai" ? "AI 개요 열기" : `${item.label} 모드`}
            title={item.label}
            onClick={() => {
              setMode(item.id)
              if (item.count) {
                setSeenCounts((current) => ({ ...current, [item.id]: item.count }))
              }
              if (item.id === "ai") setAiActivationToken((value) => value + 1)
            }}
          >
            {item.icon}
            {item.count && item.count > (seenCounts[item.id] ?? 0) ? (
              <span className="mode-count">
                {item.count - (seenCounts[item.id] ?? 0) > 99
                  ? "99+"
                  : item.count - (seenCounts[item.id] ?? 0)}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </aside>
  )
}
