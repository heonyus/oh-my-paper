/** First-use tips: one short looping clip per feature, shown once beside the control it explains. */

export type TipView = "library" | "reader" | "research"

export type FeatureTip = {
  readonly id: string
  readonly view: TipView
  /** Needs an open paper, so reader tips wait until one is on screen. */
  readonly needsDocument?: boolean
  /** Where the tip points; the first selector that matches a visible element wins. */
  readonly anchor: readonly string[]
  /** `inside` pins the tip to the top of a large area such as the page column. */
  readonly placement: "below" | "inside"
  readonly title: string
  readonly body: string
  readonly keys?: ReadonlyArray<readonly [key: string, label: string]>
  readonly clip: string
}

export const FEATURE_TIPS: readonly FeatureTip[] = [
  {
    id: "import",
    view: "library",
    anchor: [".library-empty button", ".library-import-button"],
    placement: "below",
    title: "PDF 가져오기",
    body: "파일을 끌어다 놓거나 버튼을 누르세요. 바로 열어서 읽을 수 있습니다.",
    clip: "/tutorials/import.mp4",
  },
  {
    id: "select",
    view: "reader",
    needsDocument: true,
    anchor: [".board-viewport"],
    placement: "inside",
    title: "문장을 드래그해 보세요",
    body: "고른 곳 위에 메뉴가 뜨고, 키 하나로 바로 실행됩니다. 결과는 원문 옆에 붙습니다.",
    keys: [
      ["T", "번역"],
      ["E", "설명"],
      ["C", "노트에"],
      ["H", "하이라이트"],
    ],
    clip: "/tutorials/translate.mp4",
  },
  {
    id: "page-translation",
    view: "reader",
    needsDocument: true,
    anchor: [".topbar-translation-action"],
    placement: "below",
    title: "페이지를 통째로 번역",
    body: "원문 옆에 한국어 페이지를 나란히 띄웁니다. 문단을 누르면 원문 자리로 돌아갑니다.",
    clip: "/tutorials/page-translation.mp4",
  },
  {
    id: "note",
    view: "reader",
    needsDocument: true,
    anchor: [".topbar-note-action"],
    placement: "below",
    title: "내 말로 남기는 노트",
    body: "쓰는 문장마다 근거가 된 문단을 찾아 보여줍니다. 문장을 고르고 C를 누르면 인용과 함께 담깁니다.",
    clip: "/tutorials/note.mp4",
  },
  {
    id: "overview",
    view: "reader",
    needsDocument: true,
    anchor: ['button[aria-label="AI 개요 열기"]', ".ai-overview-panel", ".research-mode-rail"],
    placement: "below",
    title: "AI 개요",
    body: "키워드, 3줄 요약, 요약을 한 번에 봅니다. 질문하면 근거 페이지와 함께 답합니다.",
    clip: "/tutorials/overview.mp4",
  },
  {
    id: "explain",
    view: "reader",
    needsDocument: true,
    anchor: [],
    placement: "below",
    title: "그림·수식 설명",
    body: "문장이나 수식을 고르고 E를 누르면 앞뒤 맥락까지 읽고 풀어서 설명합니다.",
    keys: [["E", "설명"]],
    clip: "/tutorials/explain.mp4",
  },
]

const STORAGE_KEY = "ohmypaper:feature-tips:v1"

type TipState = { readonly seen: readonly string[]; readonly off: boolean }

export function readTipState(): TipState {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null")
    if (raw && typeof raw === "object" && "seen" in raw && Array.isArray(raw.seen)) {
      return {
        seen: raw.seen.filter((id): id is string => typeof id === "string"),
        off: "off" in raw && raw.off === true,
      }
    }
  } catch {
    // Storage can be unavailable (private windows, blocked site data); tips then show again.
  }
  return { seen: [], off: false }
}

export function writeTipState(state: TipState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Same as above: a failed write only means the tip may show once more.
  }
}

/** The first unseen tip for this screen whose control is on screen. */
export function nextTip(
  view: TipView,
  hasDocument: boolean,
  state: TipState,
  findAnchor: (selectors: readonly string[]) => Element | null,
): FeatureTip | null {
  if (state.off) return null
  return (
    FEATURE_TIPS.find(
      (tip) =>
        tip.view === view &&
        tip.anchor.length > 0 &&
        (!tip.needsDocument || hasDocument) &&
        !state.seen.includes(tip.id) &&
        findAnchor(tip.anchor) !== null,
    ) ?? null
  )
}
