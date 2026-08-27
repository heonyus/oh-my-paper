import { ChevronLeft, LayoutGrid, PanelRightClose, Quote, Sparkles } from "lucide-react"
import { type JSX, useState } from "react"
import type { AiRequest, ProviderStatus } from "../../shared/ipc"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { saveCitationAssessment, saveSidebarInsight } from "../lib/sidebarCards"
import type { BoardCard, CardId, DocumentRecord } from "../types"
import { AiOverviewPanel } from "./AiOverviewPanel"
import { BoardIndexPanel } from "./BoardIndexPanel"
import { CitationPanel } from "./CitationPanel"

type ResearchMode = "ai" | "board" | "citations"

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
  readonly onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>
}): JSX.Element {
  const [mode, setMode] = useState<ResearchMode>("ai")
  const modes: readonly {
    readonly id: ResearchMode
    readonly label: string
    readonly count?: number
    readonly icon: JSX.Element
  }[] = [
    { id: "ai", label: "AI", icon: <Sparkles size={18} /> },
    { id: "board", label: "보드", count: cards.length, icon: <LayoutGrid size={18} /> },
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
    <aside className="research-sidebar" aria-label="연구 사이드바">
      <div className="research-sidebar-content">
        {!document ? (
          <p className="mode-empty">열려 있는 논문이 없습니다.</p>
        ) : mode === "ai" ? (
          <AiOverviewPanel
            document={document}
            currentPage={currentPage}
            provider={provider}
            onAiRequest={onAiRequest}
            onSave={(title, body) =>
              onCardsChange(saveSidebarInsight(cards, document, title, body))
            }
          />
        ) : mode === "board" ? (
          <BoardIndexPanel cards={cards} onJump={onJumpToCard} />
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
            aria-label={`${item.label} 모드`}
            onClick={() => setMode(item.id)}
          >
            {item.icon}
            {item.count ? <span className="mode-count">{item.count}</span> : null}
          </button>
        ))}
      </nav>
    </aside>
  )
}
