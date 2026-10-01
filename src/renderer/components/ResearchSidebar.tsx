import {
  BookMarked,
  ChevronLeft,
  Layers,
  PanelRightClose,
  Pin,
  PinOff,
  Sparkles,
} from "lucide-react"
import { type JSX, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import type { DocumentInsight, DocumentInsightKind } from "../../shared/schemas"
import { researchSidebarLayout } from "../../shared/uiLayout"
import type { SourceCitation } from "../lib/chatCitations"
import { useTranslator } from "../lib/locale"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { saveCitationAssessment, saveSidebarInsight } from "../lib/sidebarCards"
import { researchMessages } from "../messages/research"
import type { AiRequestRunner, BoardCard, CardId, DocumentRecord } from "../types"
import { AiOverviewPanel } from "./AiOverviewPanel"
import { type BoardIndexFilter, cardsInCategory } from "./BoardIndexPanel"
import { CardIndexPanel } from "./CardIndexPanel"
import { PageTranslationPortal } from "./PageTranslationPortal"
import { RelatedPapersPanel, type RelatedPapersView } from "./RelatedPapersPanel"
import { SidebarResizeHandle } from "./SidebarResizeHandle"

/** The paper's overview, the cards on its board, and other papers. */
type ResearchMode = "ai" | "cards" | "papers"

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
  onNavigateToSource,
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
  readonly onNavigateToSource?: ((citation: SourceCitation) => void) | undefined
}): JSX.Element {
  const t = useTranslator(researchMessages)
  const [mode, setMode] = useState<ResearchMode>("ai")
  const [flyout, setFlyout] = useState<"hover" | "open" | "pinned">("hover")
  const [seenCounts, setSeenCounts] = useState<Partial<Record<ResearchMode, number>>>({})
  const [cardFilter, setCardFilter] = useState<BoardIndexFilter>("all")
  const [papersView, setPapersView] = useState<RelatedPapersView>("references")
  const modeLabel = (id: ResearchMode): string => t(`sidebar.mode.${id}`)
  const modes: readonly {
    readonly id: ResearchMode
    readonly label: string
    readonly count?: number
    readonly icon: JSX.Element
  }[] = [
    { id: "ai", label: modeLabel("ai"), icon: <Sparkles size={18} /> },
    {
      id: "cards",
      label: modeLabel("cards"),
      count: cardsInCategory(cards, "all").length,
      icon: <Layers size={18} />,
    },
    {
      id: "papers",
      label: modeLabel("papers"),
      count: citations.length,
      icon: <BookMarked size={18} />,
    },
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
        <aside className="research-sidebar is-collapsed" aria-label={t("sidebar.collapsedLabel")}>
          <nav className="research-mode-rail">
            <button
              type="button"
              onClick={() => {
                setFlyout("open")
                onToggle()
              }}
              aria-label={t("sidebar.expand")}
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
        aria-label={t("sidebar.label")}
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
              label={t("sidebar.resize")}
              width={width}
              minimum={researchSidebarLayout.contentMinimum}
              maximum={researchSidebarLayout.contentMaximum}
              edge="start"
              onWidthChange={onWidthChange}
            />
          ) : null}
          <div className="research-sidebar-content">
            {!document ? (
              <p className="mode-empty">{t("sidebar.noDocument")}</p>
            ) : mode === "ai" ? (
              <AiOverviewPanel
                key={document.id}
                document={document}
                currentPage={currentPage}
                provider={provider}
                onAiRequest={onAiRequest}
                cachedInsights={insights}
                onInsightChange={onInsightChange}
                onNavigateToSource={onNavigateToSource}
                onSave={(title, body, sourceTitle) =>
                  onCardsChange(saveSidebarInsight(cards, document, title, body, sourceTitle))
                }
              />
            ) : mode === "cards" ? (
              <CardIndexPanel
                cards={cards}
                filter={cardFilter}
                onFilterChange={setCardFilter}
                onJump={onJumpToCard}
              />
            ) : (
              <RelatedPapersPanel
                document={document}
                citations={citations}
                view={papersView}
                onViewChange={setPapersView}
                onAiRequest={onAiRequest}
                onSaveAssessment={(entry, state, result) =>
                  onCardsChange(saveCitationAssessment(cards, document, entry, state.paper, result))
                }
              />
            )}
          </div>
        </div>
        <nav className="research-mode-rail" aria-label={t("sidebar.modes")}>
          <button
            type="button"
            onClick={() => setFlyout((current) => (current === "pinned" ? "hover" : "pinned"))}
            aria-label={flyout === "pinned" ? t("sidebar.unpin") : t("sidebar.pin")}
            aria-pressed={flyout === "pinned"}
            title={flyout === "pinned" ? t("sidebar.unpinShort") : t("sidebar.pinShort")}
          >
            {flyout === "pinned" ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setFlyout("hover")
              onToggle()
            }}
            aria-label={t("sidebar.collapse")}
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
              aria-expanded={mode === item.id && flyout === "pinned"}
              aria-description={
                mode === item.id && flyout === "pinned" ? t("sidebar.pinned") : undefined
              }
              data-research-mode={item.id}
              aria-label={
                item.id === "ai"
                  ? t("sidebar.openAi")
                  : t("sidebar.modeButton", { label: item.label })
              }
              title={item.label}
              onClick={() => {
                if (flyout !== "pinned") setFlyout("open")
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
