import {
  ArrowUpRight,
  Highlighter,
  Languages,
  MessageSquareText,
  NotebookPen,
  Palette,
  StickyNote,
} from "lucide-react"
import type { JSX } from "react"
import { conciseCardTitle } from "../lib/cardPresentation"
import type { BoardCard, CardId } from "../types"

export type BoardCategoryKind = Exclude<BoardCard["kind"], "citation">

type CategoryCopy = {
  readonly purpose: string
  readonly empty: string
  readonly action: string
}

const categoryCopy: Readonly<Record<BoardCategoryKind, CategoryCopy>> = {
  translation: {
    purpose: "번역문과 원문을 함께 봅니다.",
    empty: "PDF 문장을 선택해 번역하면 결과와 원문이 여기에 함께 저장됩니다.",
    action: "보드에서 보기",
  },
  explanation: {
    purpose: "해설 핵심과 근거 구절을 함께 봅니다.",
    empty: "섹션·그림·선택 구절을 설명하면 근거가 연결된 해설이 여기에 나타납니다.",
    action: "근거와 함께 보기",
  },
  infographic: {
    purpose: "그림·표 분석을 자료별로 봅니다.",
    empty: "그림이나 표에서 AI 해설을 실행하면 시각 분석 카드가 여기에 모입니다.",
    action: "분석 카드 보기",
  },
  note: {
    purpose: "메모와 연결된 원문을 다시 찾습니다.",
    empty: "선택 구절을 노트로 저장하거나 번역을 주석으로 바꾸면 여기에 모입니다.",
    action: "보드에서 편집",
  },
  sticky: {
    purpose: "빠른 메모를 모아 편집 위치로 이동합니다.",
    empty: "포스트잇 도구로 보드를 클릭하면 빠른 메모가 여기에 나타납니다.",
    action: "보드에서 편집",
  },
  highlight: {
    purpose: "핵심 문장을 페이지 순서로 다시 찾습니다.",
    empty: "PDF 문장을 선택해 하이라이트하면 핵심 근거가 여기에 모입니다.",
    action: "원문 위치 보기",
  },
}

function KindIcon({ kind, size }: { readonly kind: BoardCategoryKind; readonly size: number }) {
  switch (kind) {
    case "translation":
      return <Languages size={size} />
    case "explanation":
      return <MessageSquareText size={size} />
    case "infographic":
      return <Palette size={size} />
    case "note":
      return <NotebookPen size={size} />
    case "sticky":
      return <StickyNote size={size} />
    case "highlight":
      return <Highlighter size={size} />
  }
}

function plainPreview(value: string): string {
  return value
    .replace(/[#*_>`]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}

function boundedPreview(value: string, maximum: number): string {
  const plain = plainPreview(value)
  if (plain.length <= maximum) return plain
  const candidate = plain.slice(0, maximum)
  const boundary = candidate.lastIndexOf(" ")
  return `${candidate.slice(0, boundary > maximum * 0.7 ? boundary : maximum).trim()}…`
}

function previewFor(card: BoardCard, kind: BoardCategoryKind): string {
  switch (kind) {
    case "translation":
    case "explanation":
    case "note":
      return plainPreview(card.body) || card.anchor.quote
    case "infographic":
      return boundedPreview(card.body, 280) || card.anchor.quote
    case "sticky":
      return plainPreview(card.body) || "내용이 없는 포스트잇"
    case "highlight":
      return card.anchor.quote
  }
}

function sourceFor(card: BoardCard, kind: BoardCategoryKind): string | null {
  switch (kind) {
    case "translation":
    case "explanation":
    case "infographic":
    case "note":
      return card.anchor.quote
    case "sticky":
    case "highlight":
      return null
  }
}

export function BoardIndexPanel({
  cards,
  kind,
  label,
  onJump,
}: {
  readonly cards: readonly BoardCard[]
  readonly kind: BoardCategoryKind
  readonly label: string
  readonly onJump: (id: CardId) => void
}): JSX.Element {
  const visible = cards.filter((card) => card.kind === kind)
  const copy = categoryCopy[kind]
  return (
    <section
      className="sidebar-mode-panel board-category-panel"
      data-kind={kind}
      aria-label={`${label} 인덱스`}
    >
      <header className="mode-panel-head">
        <div>
          <KindIcon kind={kind} size={18} />
          <h2>{label}</h2>
        </div>
        <span>{visible.length}</span>
      </header>
      <p className="board-category-purpose">{copy.purpose}</p>
      {visible.length > 0 ? (
        <ol className="board-index-list">
          {visible.map((card) => {
            const source = sourceFor(card, kind)
            return (
              <li key={card.id} data-kind={kind}>
                <button
                  type="button"
                  data-kind={kind}
                  aria-label={`${card.title}, p.${card.anchor.page}, ${copy.action}`}
                  onClick={() => onJump(card.id)}
                >
                  <span className="board-index-icon">
                    <KindIcon kind={kind} size={20} />
                  </span>
                  <strong className="board-index-title">
                    {conciseCardTitle(card.title, card.title)}
                  </strong>
                  <span className="board-index-page">p.{card.anchor.page}</span>
                  <span className="board-index-preview">{previewFor(card, kind)}</span>
                  {source ? (
                    <span className="board-index-source">
                      <small>원문</small>
                      <span>{source}</span>
                    </span>
                  ) : null}
                  <span className="board-index-action">
                    {copy.action} <ArrowUpRight size={12} />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="board-category-empty">
          <span className="board-category-empty-icon">
            <KindIcon kind={kind} size={22} />
          </span>
          <strong>아직 저장된 항목이 없습니다.</strong>
          <p>{copy.empty}</p>
        </div>
      )}
    </section>
  )
}
