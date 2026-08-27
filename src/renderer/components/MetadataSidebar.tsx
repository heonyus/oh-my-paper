import { Bot, ChevronRight, FileText, LayoutGrid, PanelRightClose, Tag } from "lucide-react"
import type { JSX } from "react"
import type { BoardCard, CardId, DocumentRecord } from "../types"

type MetadataSidebarProps = {
  readonly document: DocumentRecord | null
  readonly pageCount: number
  readonly currentPage: number
  readonly tags: readonly string[]
  readonly cardCount: number
  readonly cards?: readonly BoardCard[]
  readonly expanded?: boolean
  readonly onToggle: () => void
  readonly onJumpToCard?: ((id: CardId) => void) | undefined
  readonly onOpenChat?: (() => void) | undefined
}

const cardKindLabel: Readonly<Record<BoardCard["kind"], string>> = {
  translation: "번역",
  explanation: "AI 설명",
  infographic: "AI 카드",
  note: "주석",
  highlight: "하이라이트",
  citation: "인용",
}

function MetadataRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}): JSX.Element {
  return (
    <div className="metadata-row">
      <span className="metadata-label">{label}</span>
      <span className="metadata-value">{value}</span>
    </div>
  )
}

export function MetadataSidebar({
  document,
  pageCount,
  currentPage,
  tags,
  cardCount,
  cards = [],
  expanded = true,
  onToggle,
  onJumpToCard,
  onOpenChat,
}: MetadataSidebarProps): JSX.Element {
  if (!expanded) {
    return (
      <aside className="sidebar-rail" aria-label="메타정보 접힘 레일">
        <button
          type="button"
          className="sidebar-rail-toggle"
          onClick={onToggle}
          aria-label="사이드바 펼치기"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </aside>
    )
  }
  return (
    <aside className="metadata-sidebar" aria-label="메타정보 사이드바">
      <header className="sidebar-head">
        {onOpenChat ? (
          <button
            type="button"
            className="sidebar-chat"
            onClick={onOpenChat}
            aria-label="AI 에이전트 열기"
          >
            <Bot size={15} aria-hidden="true" />
            <span>AI 채팅</span>
          </button>
        ) : null}
        <button
          type="button"
          className="sidebar-collapse"
          onClick={onToggle}
          aria-label="사이드바 접기"
        >
          <PanelRightClose size={16} aria-hidden="true" />
        </button>
      </header>
      {document === null ? (
        <p className="sidebar-empty">열려 있는 문서가 없습니다</p>
      ) : (
        <>
          <h2 className="sidebar-title">{document.name.replace(/\.pdf$/i, "")}</h2>
          <dl className="metadata-group">
            <MetadataRow label="페이지" value={`${pageCount}페이지`} />
            <MetadataRow label="현재 위치" value={`현재 ${currentPage}페이지`} />
          </dl>
          <section className="sidebar-section" aria-label="보드 바로가기">
            <h3>
              <LayoutGrid size={14} aria-hidden="true" /> 보드 바로가기
            </h3>
            {cards.length > 0 ? (
              <ul className="sidebar-card-list">
                {cards.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      aria-label={`${card.title} p.${card.anchor.page} 카드로 이동`}
                      onClick={() => onJumpToCard?.(card.id)}
                    >
                      <span className="sidebar-card-copy">
                        <span className="sidebar-card-kind">{cardKindLabel[card.kind]}</span>
                        <span className="sidebar-card-title">{card.title}</span>
                      </span>
                      <span className="outline-page">p.{card.anchor.page}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sidebar-hint">보드에 만든 카드가 없습니다</p>
            )}
          </section>
          <section className="sidebar-section" aria-label="태그">
            <h3>
              <Tag size={14} aria-hidden="true" /> 태그
            </h3>
            {tags.length > 0 ? (
              <ul className="tag-list">
                {tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            ) : (
              <p className="sidebar-hint">태그가 없습니다</p>
            )}
          </section>
          <footer className="sidebar-counts">
            <FileText size={14} aria-hidden="true" />
            <span>연구 카드 {` ${cardCount}`}개</span>
          </footer>
        </>
      )}
    </aside>
  )
}
