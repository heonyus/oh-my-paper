import type { Catalog } from "../../shared/i18n/locale"

const ko = {
  // Board index in the research sidebar
  "index.translation.purpose": "번역문과 원문을 함께 봅니다.",
  "index.translation.empty": "PDF 문장을 선택해 번역하면 결과와 원문이 여기에 함께 저장됩니다.",
  "index.translation.action": "보드에서 보기",
  "index.explanation.purpose": "해설 핵심과 근거 구절을 함께 봅니다.",
  "index.explanation.empty":
    "섹션·그림·선택 구절을 설명하면 근거가 연결된 해설이 여기에 나타납니다.",
  "index.explanation.action": "근거와 함께 보기",
  "index.infographic.purpose": "그림·표 분석을 자료별로 봅니다.",
  "index.infographic.empty": "그림이나 표에서 AI 해설을 실행하면 시각 분석 카드가 여기에 모입니다.",
  "index.infographic.action": "분석 카드 보기",
  "index.note.purpose": "보드에 남긴 메모와 그 원문을 함께 봅니다.",
  "index.note.empty": "보드에 남긴 메모 카드가 여기에 모입니다.",
  "index.sticky.purpose": "빠른 메모를 모아 편집 위치로 이동합니다.",
  "index.sticky.empty": "포스트잇 도구로 보드를 클릭하면 빠른 메모가 여기에 나타납니다.",
  "index.highlight.purpose": "핵심 문장을 페이지 순서로 다시 찾습니다.",
  "index.highlight.empty": "PDF 문장을 선택해 하이라이트하면 핵심 근거가 여기에 모입니다.",
  "index.highlight.action": "원문 위치 보기",
  "index.emptySticky": "내용이 없는 포스트잇",
  "index.label": "{label} 인덱스",
  "index.source": "원문",
  "index.nothingSaved": "아직 저장된 항목이 없습니다.",

  // A card on the board
  "card.label": "{title}, {page} 페이지 연결 카드",
  "card.generating": "AI 응답 생성 중",
  "card.stickyContent": "포스트잇 내용",
  "card.stickyPlaceholder": "Markdown으로 메모하세요…",
  "card.stickyEmptyPlaceholder": "메모",
  "card.regenerateTitle": "카드 제목 다시 생성",
  "card.regenerateTitleHint": "제목 다시 생성",
  "card.expand": "카드 펼치기",
  "card.minimize": "카드 최소화",
  "card.close": "카드 닫기",
  "card.resize": "카드 크기 조절",
  "card.copyLabel": "카드 내용 복사",
  "card.copiedLabel": "카드 내용 복사됨",
  "card.copyFailedLabel": "카드 내용 복사 실패",
  "card.copy": "복사",
  "card.copied": "복사됨",
  "card.copyFailed": "복사 실패",
  "card.openPaper": "논문 열기",
  "card.saveAsAnnotationLabel": "번역을 주석으로 저장",
  "card.saveAsAnnotation": "주석으로 저장",
  "card.jumpToSource": "p. {page} 원문으로 이동",

  // Follow-up questions on a card
  "chat.section": "카드 후속 질문",
  "chat.input": "카드에 후속 질문",
  "chat.submit": "후속 질문 보내기",
  "chat.failed": "AI 설정을 확인한 뒤 다시 보내주세요.",

  // Toolbars over the PDF
  "overlay.highlightActions": "하이라이트 작업",
  "overlay.deleteHighlight": "하이라이트 삭제",
  "overlay.selectionActions": "선택 작업",
  "overlay.translate": "번역",
  "overlay.explain": "설명",
  "overlay.infographic": "인포그래픽",
  "overlay.highlight": "하이라이트",
  "overlay.toNote": "노트에",

  // Minimap
  "minimap.label": "보드 미니맵",
  "minimap.title": "미니맵",
  "minimap.home": "첫 페이지로",
  "minimap.hide": "미니맵 숨기기",
  "minimap.navigate": "미니맵 탐색",
  "minimap.paper": "논문",
  "minimap.cards": "카드",
  "minimap.view": "현재 화면",

  // The notice after jumping to a piece of evidence
  "evidence.page": "{page}페이지",
  "evidence.linked": "연결된 원문 구절",
  "evidence.noPosition": "원문 페이지 · 구절 위치 정보 없음",
  "evidence.dismiss": "표시 닫기",

  // Titles new cards start with
  "default.explanationTitle": "선택 구절 설명",
  "default.infographicTitle": "인포그래픽",
  "default.noteTitle": "메모",
  "default.highlightTitle": "하이라이트",
  "default.annotationTitle": "AI 번역",
  "default.stickyTitle": "포스트잇",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "index.translation.purpose": "See each translation beside its source.",
  "index.translation.empty":
    "Select a sentence in the PDF and translate it. The result is saved here with its source.",
  "index.translation.action": "View on board",
  "index.explanation.purpose": "See the key points of each explanation with its evidence.",
  "index.explanation.empty":
    "Explain a section, figure or selected passage, and the explanation appears here linked to its evidence.",
  "index.explanation.action": "View with evidence",
  "index.infographic.purpose": "See figure and table analyses, one per item.",
  "index.infographic.empty":
    "Run an AI explanation on a figure or table, and its analysis card collects here.",
  "index.infographic.action": "View analysis card",
  "index.note.purpose": "See the memos you left on the board with their source.",
  "index.note.empty": "Memo cards you leave on the board collect here.",
  "index.sticky.purpose": "Collect quick notes and go back to where you wrote them.",
  "index.sticky.empty": "Click the board with the sticky note tool, and quick notes appear here.",
  "index.highlight.purpose": "Find key sentences again in page order.",
  "index.highlight.empty":
    "Select a sentence in the PDF and highlight it. Key evidence collects here.",
  "index.highlight.action": "View in source",
  "index.emptySticky": "Empty sticky note",
  "index.label": "{label} index",
  "index.source": "Source",
  "index.nothingSaved": "Nothing saved yet.",

  "card.label": "{title}, card linked to page {page}",
  "card.generating": "Generating AI response",
  "card.stickyContent": "Sticky note content",
  "card.stickyPlaceholder": "Write a note in Markdown…",
  "card.stickyEmptyPlaceholder": "Memo",
  "card.regenerateTitle": "Regenerate card title",
  "card.regenerateTitleHint": "Regenerate title",
  "card.expand": "Expand card",
  "card.minimize": "Minimize card",
  "card.close": "Close card",
  "card.resize": "Resize card",
  "card.copyLabel": "Copy card content",
  "card.copiedLabel": "Card content copied",
  "card.copyFailedLabel": "Couldn't copy card content",
  "card.copy": "Copy",
  "card.copied": "Copied",
  "card.copyFailed": "Copy failed",
  "card.openPaper": "Open paper",
  "card.saveAsAnnotationLabel": "Save translation as annotation",
  "card.saveAsAnnotation": "Save as annotation",
  "card.jumpToSource": "Go to source, p. {page}",

  "chat.section": "Follow-up questions",
  "chat.input": "Ask a follow-up about this card",
  "chat.submit": "Send follow-up",
  "chat.failed": "Check your AI settings, then send again.",

  "overlay.highlightActions": "Highlight actions",
  "overlay.deleteHighlight": "Delete highlight",
  "overlay.selectionActions": "Selection actions",
  "overlay.translate": "Translate",
  "overlay.explain": "Explain",
  "overlay.infographic": "Infographic",
  "overlay.highlight": "Highlight",
  "overlay.toNote": "To note",

  "minimap.label": "Board minimap",
  "minimap.title": "Minimap",
  "minimap.home": "Back to first page",
  "minimap.hide": "Hide minimap",
  "minimap.navigate": "Minimap navigation",
  "minimap.paper": "Paper",
  "minimap.cards": "Cards",
  "minimap.view": "Current view",

  "evidence.page": "Page {page}",
  "evidence.linked": "Linked source passage",
  "evidence.noPosition": "Source page · passage position unknown",
  "evidence.dismiss": "Dismiss",

  "default.explanationTitle": "Passage explanation",
  "default.infographicTitle": "Infographic",
  "default.noteTitle": "Memo",
  "default.highlightTitle": "Highlight",
  "default.annotationTitle": "AI translation",
  "default.stickyTitle": "Sticky note",
}

export type BoardMessageKey = keyof typeof ko

export const boardMessages: Catalog<typeof ko> = { ko, en }
