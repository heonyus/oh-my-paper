/** First-use tips: one short looping clip per feature, shown once beside the control it explains. */

import type { Locale } from "../../shared/i18n/locale"
import type { WebMessageKey } from "../messages"

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
  /** Catalog keys, so the tip speaks the app's language. */
  readonly title: WebMessageKey
  readonly body: WebMessageKey
  readonly keys?: ReadonlyArray<readonly [key: string, label: WebMessageKey]>
  readonly clip: string
}

export const FEATURE_TIPS: readonly FeatureTip[] = [
  {
    id: "import",
    view: "library",
    anchor: [".library-empty button", ".library-import-button"],
    placement: "below",
    title: "tip.import.title",
    body: "tip.import.body",
    clip: "/tutorials/import.mp4",
  },
  {
    id: "select",
    view: "reader",
    needsDocument: true,
    anchor: [".board-viewport"],
    placement: "inside",
    title: "tip.select.title",
    body: "tip.select.body",
    keys: [
      ["T", "key.T"],
      ["E", "key.E"],
      ["C", "key.C"],
      ["H", "key.H"],
    ],
    clip: "/tutorials/translate.mp4",
  },
  {
    id: "page-translation",
    view: "reader",
    needsDocument: true,
    anchor: [".topbar-translation-action"],
    placement: "below",
    title: "tip.pageTranslation.title",
    body: "tip.pageTranslation.body",
    clip: "/tutorials/page-translation.mp4",
  },
  {
    id: "note",
    view: "reader",
    needsDocument: true,
    anchor: [".topbar-note-action"],
    placement: "below",
    title: "tip.note.title",
    body: "tip.note.body",
    keys: [
      ["C", "key.C"],
      ["N", "key.N"],
    ],
    clip: "/tutorials/note.mp4",
  },
  {
    id: "overview",
    view: "reader",
    needsDocument: true,
    anchor: ['button[data-research-mode="ai"]', ".ai-overview-panel", ".research-mode-rail"],
    placement: "below",
    title: "tip.overview.title",
    body: "tip.overview.body",
    clip: "/tutorials/overview.mp4",
  },
  {
    id: "explain",
    view: "reader",
    needsDocument: true,
    anchor: [],
    placement: "below",
    title: "tip.explain.title",
    body: "tip.explain.body",
    keys: [["E", "key.E"]],
    clip: "/tutorials/explain.mp4",
  },
]

/**
 * Translating an English paper into English leaves it as it is, so the English screen has no
 * translation clips: selecting shows an explanation instead, and page translation keeps Korean.
 */
const ENGLISH_STAND_INS: Readonly<Record<string, string>> = {
  "/tutorials/translate.mp4": "/tutorials/en/explain.mp4",
  "/tutorials/page-translation.mp4": "/tutorials/page-translation.mp4",
}

/** The clip recorded on the screen in `locale`: the English ones live under /tutorials/en. */
export function localizedClip(clip: string, locale: Locale): string {
  if (locale !== "en") return clip
  return ENGLISH_STAND_INS[clip] ?? clip.replace(/^\/tutorials\//u, "/tutorials/en/")
}

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
