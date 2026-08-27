import { Highlighter, Languages, LayoutGrid, MessageSquareText, Palette, Quote } from "lucide-react"
import { type JSX, useState } from "react"
import type { BoardCard, CardId } from "../types"

type BoardFilter = "all" | BoardCard["kind"]

const labels: Readonly<Record<BoardCard["kind"], string>> = {
  translation: "번역",
  explanation: "AI 설명",
  infographic: "AI 카드",
  note: "노트",
  highlight: "하이라이트",
  citation: "인용",
}

function KindIcon({ kind }: { readonly kind: BoardCard["kind"] }): JSX.Element {
  switch (kind) {
    case "translation":
      return <Languages size={14} />
    case "explanation":
      return <MessageSquareText size={14} />
    case "infographic":
      return <Palette size={14} />
    case "note":
      return <MessageSquareText size={14} />
    case "highlight":
      return <Highlighter size={14} />
    case "citation":
      return <Quote size={14} />
  }
}

export function BoardIndexPanel({
  cards,
  onJump,
}: {
  readonly cards: readonly BoardCard[]
  readonly onJump: (id: CardId) => void
}): JSX.Element {
  const [filter, setFilter] = useState<BoardFilter>("all")
  const visible = filter === "all" ? cards : cards.filter((card) => card.kind === filter)
  const filters: readonly BoardFilter[] = [
    "all",
    "translation",
    "explanation",
    "infographic",
    "note",
    "highlight",
    "citation",
  ]
  return (
    <section className="sidebar-mode-panel" aria-label="보드 인덱스">
      <header className="mode-panel-head">
        <div>
          <LayoutGrid size={18} />
          <h2>보드</h2>
        </div>
        <span>{cards.length}</span>
      </header>
      <div className="board-filter-row" role="toolbar" aria-label="보드 카드 필터">
        {filters.map((value) => (
          <button
            type="button"
            key={value}
            data-active={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "전체" : labels[value]}
          </button>
        ))}
      </div>
      {visible.length > 0 ? (
        <ol className="board-index-list">
          {visible.map((card) => (
            <li key={card.id}>
              <button type="button" onClick={() => onJump(card.id)}>
                <span className="board-index-icon">
                  <KindIcon kind={card.kind} />
                </span>
                <span className="board-index-copy">
                  <strong>{card.title}</strong>
                  <span>{card.body || card.anchor.quote}</span>
                </span>
                <span className="board-index-page">p.{card.anchor.page}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mode-empty">이 필터에 저장된 카드가 없습니다.</p>
      )}
    </section>
  )
}
