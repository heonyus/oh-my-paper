import {
  ChevronLeft,
  Highlighter,
  Languages,
  MessageSquareText,
  NotebookPen,
  Palette,
  PanelRightClose,
  Pin,
  PinOff,
  Quote,
  Search,
  Sparkles,
  StickyNote,
} from "lucide-react"
import { type JSX, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import type { DocumentInsight, DocumentInsightKind } from "../../shared/schemas"
import { researchSidebarLayout } from "../../shared/uiLayout"
import { togglePageTranslation } from "../lib/pageTranslationToggle"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { saveCitationAssessment, saveSidebarInsight } from "../lib/sidebarCards"
import type { AiRequestRunner, BoardCard, BoardTool, CardId, DocumentRecord } from "../types"
import { AiOverviewPanel } from "./AiOverviewPanel"
import { BoardIndexPanel } from "./BoardIndexPanel"
import { CitationPanel } from "./CitationPanel"
import { PageTranslationPortal } from "./PageTranslationPortal"
import { ScholarSearchPanel } from "./ScholarSearchPanel"
import { SidebarResizeHandle } from "./SidebarResizeHandle"

type CardMode = Exclude<BoardCard["kind"], "citation" | "translation">
type ResearchMode = "ai" | "citations" | "translation" | "scholar" | CardMode

const cardModeLabels: Readonly<Record<CardMode, string>> = {
  explanation: "AI 설명",
  infographic: "AI 카드",
  note: "노트",
  sticky: "포스트잇",
  highlight: "하이라이트",
}

function isCardMode(mode: ResearchMode): mode is CardMode {
  return mode !== "ai" && mode !== "citations" && mode !== "translation" && mode !== "scholar"
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
  tool,
  onToolChange,
}: {
  readonly document: DocumentRecord | null
  readonly currentPage: number
  readonly cards: readonly BoardCard[]
  readonly citations: readonly CitationIndexEntry[]
  readonly expanded: boolean
  readonly provider: ProviderStatus
  readonly documentReady?: boolean | undefined
  readonly onToggle: () => void
  readonly onJumpToCard: (id: CardId) => void
  readonly onCardsChange: (cards: readonly BoardCard[]) => void
  readonly onAiRequest: AiRequestRunner
  readonly width?: number | undefined
  readonly onWidthChange?: ((width: number) => void) | undefined
  readonly insights?: readonly DocumentInsight[] | undefined
  readonly onInsightChange?: ((kind: DocumentInsightKind, value: string) => void) | undefined
  readonly tool: BoardTool
  readonly onToolChange: (tool: BoardTool) => void
}): JSX.Element {
  const [mode, setMode] = useState<ResearchMode>("ai")
  const [flyout, setFlyout] = useState<"hover" | "open" | "pinned">("hover")
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
    { id: "scholar", label: "논문 탐색", icon: <Search size={18} /> },
  ]
  const translationPortal = document ? (
    <PageTranslationPortal
      document={document}
      currentPage={currentPage}
      citations={citations}
      provider={provider}
      onAiRequest={onAiRequest}
    />
  ) : null
  if (!expanded) {
    return (
      <>
        {translationPortal}
        <aside className="research-sidebar is-collapsed" aria-label="연구 사이드바 접힘">
          <nav className="research-mode-rail">
            <button
              type="button"
              onClick={() => {
                setFlyout("open")
                onToggle()
              }}
              aria-label="연구 사이드바 펼치기"
              aria-expanded={false}
            >
              <ChevronLeft size={18} />
            </button>
          </nav>
        </aside>
      </>
    )
  }
  return (
    <>
      {translationPortal}
      <aside
        className="research-sidebar"
        aria-label="연구 사이드바"
        data-mode={mode}
        data-flyout={flyout}
        onPointerLeave={() => setFlyout((current) => (current === "pinned" ? current : "hover"))}
        style={{
          width: researchSidebarLayout.railWidth,
          minWidth: researchSidebarLayout.railWidth,
        }}
      >
        <div className="research-sidebar-flyout" style={{ width }}>
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
                onSave={(title, body) =>
                  onCardsChange(saveSidebarInsight(cards, document, title, body))
                }
              />
            ) : mode === "translation" ? (
              <BoardIndexPanel
                cards={cards}
                kind="translation"
                label="번역"
                onJump={onJumpToCard}
              />
            ) : mode === "highlight" ? (
              <BoardIndexPanel
                cards={cards}
                kind="highlight"
                label={cardModeLabels.highlight}
                onJump={onJumpToCard}
              />
            ) : isCardMode(mode) ? (
              <BoardIndexPanel
                cards={cards}
                kind={mode}
                label={cardModeLabels[mode]}
                onJump={onJumpToCard}
              />
            ) : mode === "scholar" ? (
              <ScholarSearchPanel key={document.id} document={document} citations={citations} />
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
        </div>
        <nav className="research-mode-rail" aria-label="연구 사이드바 모드">
          <button
            type="button"
            onClick={() => setFlyout((current) => (current === "pinned" ? "hover" : "pinned"))}
            aria-label={flyout === "pinned" ? "연구 사이드바 고정 해제" : "연구 사이드바 고정"}
            aria-pressed={flyout === "pinned"}
            title={flyout === "pinned" ? "고정 해제" : "고정"}
          >
            {flyout === "pinned" ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setFlyout("hover")
              onToggle()
            }}
            aria-label="연구 사이드바 접기"
            aria-expanded
          >
            <PanelRightClose size={18} />
          </button>
          <span className="mode-rail-divider" />
          {modes.map((item) => (
            <button
              type="button"
              key={item.id}
              data-active={mode === item.id}
              aria-pressed={mode === item.id}
              aria-expanded={mode === item.id && flyout === "pinned" && mode !== "translation"}
              aria-description={mode === item.id && flyout === "pinned" ? "고정됨" : undefined}
              aria-label={item.id === "ai" ? "AI 개요 열기" : `${item.label} 모드`}
              title={item.label}
              onClick={() => {
                if (flyout !== "pinned") setFlyout("open")
                if (item.id === "translation") togglePageTranslation(currentPage)
                if (item.id === "sticky" && tool !== "sticky") onToolChange("sticky")
                else if (item.id !== "sticky" && tool === "sticky") onToolChange("select")
                setMode(item.id)
                if (item.count) {
                  setSeenCounts((current) => ({ ...current, [item.id]: item.count }))
                }
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
    </>
  )
}
