import type { Catalog } from "../../shared/i18n/locale"

const ko = {
  // The reader's note pane
  "pane.label": "내 노트",
  "pane.close": "노트 닫기",
  "pane.preparing": "준비 중",
  "pane.error": "오류",
  "density.label": "여백 반응",
  "density.quiet": "조용히",
  "density.normal": "보통",
  "density.active": "적극적",

  // The editor
  "editor.body": "내 노트 본문",
  "editor.headingPlaceholder": "제목",
  "editor.placeholder": "내 말로 적어보세요. / 를 누르면 블록을 고를 수 있어요",

  // Slash menu
  "slash.menu": "블록 추가",
  "slash.empty": "맞는 블록이 없습니다",
  "slash.heading.label": "제목",
  "slash.heading.hint": "큰 제목",
  "slash.subheading.label": "소제목",
  "slash.subheading.hint": "작은 제목",
  "slash.bullet.label": "목록",
  "slash.bullet.hint": "글머리 기호 목록",
  "slash.ordered.label": "번호 목록",
  "slash.ordered.hint": "순서가 있는 목록",
  "slash.quote.label": "인용",
  "slash.quote.hint": "원문이나 생각을 인용",
  "slash.code.label": "코드",
  "slash.code.hint": "코드 블록",
  "slash.divider.label": "구분선",
  "slash.divider.hint": "단락 나누기",

  // The margin beside the note
  "margin.label": "여백",
  "margin.source": "원문",
  "margin.viewSource": "{page}쪽 원문 보기",
  "margin.attached": "근거로 붙임",
  "margin.attach": "근거로 붙이기",
  "margin.tutor": "AI 추천",
  "margin.tutorWriting": "AI 추천을 쓰는 중",
  "margin.fold": "접기",
  "margin.unfold": "펼치기",
  "margin.pin": "고정",
  "margin.dismiss": "지우기",
  "margin.pinnedLabel": "AI 추천",

  // A memo card on the board
  "memo.content": "메모 내용",
  "memo.placeholder": "메모",
  "memo.edit": "메모 고쳐 쓰기",

  // A note card, written from anywhere and added to a note
  "card.label": "노트 카드",
  "card.content": "노트 카드 내용",
  "card.placeholder": "떠오른 생각을 내 말로 적어 두세요",
  "card.paperTarget": "{page}쪽 · {title}",
  "card.looseTarget": "모아 둔 노트",
  "card.close": "닫기",
  "card.minimize": "노트 카드 최소화",
  "card.expand": "노트 카드 펼치기",
  "card.full": "노트가 가득 차서 더 붙일 수 없습니다",
  "card.savedPaper": "{page}쪽 노트에 붙였어요",
  "card.savedLoose": "모아 둔 노트에 붙였어요",
  "card.open": "열기",
  "card.new": "노트 카드",

  // The note that belongs to no paper
  "loose.title": "모아 둔 노트",
  "loose.close": "모아 둔 노트 닫기",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "pane.label": "My note",
  "pane.close": "Close note",
  "pane.preparing": "Preparing",
  "pane.error": "Error",
  "density.label": "Margin responses",
  "density.quiet": "Quiet",
  "density.normal": "Normal",
  "density.active": "Active",

  "editor.body": "My note text",
  "editor.headingPlaceholder": "Heading",
  "editor.placeholder": "Write in your own words. Type / to pick a block",

  "slash.menu": "Add block",
  "slash.empty": "No matching blocks",
  "slash.heading.label": "Heading",
  "slash.heading.hint": "Large heading",
  "slash.subheading.label": "Subheading",
  "slash.subheading.hint": "Small heading",
  "slash.bullet.label": "Bulleted list",
  "slash.bullet.hint": "List with bullets",
  "slash.ordered.label": "Numbered list",
  "slash.ordered.hint": "List in order",
  "slash.quote.label": "Quote",
  "slash.quote.hint": "Quote the source or a thought",
  "slash.code.label": "Code",
  "slash.code.hint": "Code block",
  "slash.divider.label": "Divider",
  "slash.divider.hint": "Separate sections",

  "margin.label": "Margin",
  "margin.source": "Source",
  "margin.viewSource": "View source on p. {page}",
  "margin.attached": "Attached as evidence",
  "margin.attach": "Attach as evidence",
  "margin.tutor": "AI suggestion",
  "margin.tutorWriting": "AI suggestion is being written",
  "margin.fold": "Fold",
  "margin.unfold": "Unfold",
  "margin.pin": "Keep",
  "margin.dismiss": "Remove",
  "margin.pinnedLabel": "AI suggestion",

  "memo.content": "Memo content",
  "memo.placeholder": "Memo",
  "memo.edit": "Edit memo",

  "card.label": "Note card",
  "card.content": "Note card text",
  "card.placeholder": "Jot the thought down in your own words",
  "card.paperTarget": "p. {page} · {title}",
  "card.looseTarget": "Loose notes",
  "card.close": "Close",
  "card.minimize": "Minimize note card",
  "card.expand": "Expand note card",
  "card.full": "This note is full; nothing more can be added",
  "card.savedPaper": "Added to the note at p. {page}",
  "card.savedLoose": "Added to loose notes",
  "card.open": "Open",
  "card.new": "Note card",

  "loose.title": "Loose notes",
  "loose.close": "Close loose notes",
}

export type NoteMessageKey = keyof typeof ko

export const noteMessages: Catalog<typeof ko> = { ko, en }
