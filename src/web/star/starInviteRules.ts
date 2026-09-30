import { z } from "zod"
import type { GithubStarAnswer } from "../../shared/githubStar"
import type { ReaderNote } from "../../shared/readerNote"
import type { DocumentRecord } from "../../shared/schemas"

/** Different days with local activity before the invitation may appear. */
export const MIN_ACTIVE_DAYS = 3
/** How long `나중에`, or an invitation left alone, keeps it away. */
export const SNOOZE_DAYS = 14
export const STAR_INVITE_STORAGE_KEY = "ohmypaper:github-star:v1"

const DAY_MS = 24 * 60 * 60 * 1000

const starInviteStateSchema = z.object({
  /** `opened`: the reader went to GitHub; `never`: 다시 보지 않기. Either ends the invitation. */
  closed: z.enum(["opened", "never"]).nullable().catch(null),
  /** The earliest time the invitation may appear again. */
  nextAt: z.string().datetime().nullable().catch(null),
  /** QA only: treats the activity threshold as met; closing and waiting still apply. */
  preview: z.boolean().catch(false),
})

export type StarInviteState = Readonly<z.infer<typeof starInviteStateSchema>>

const EMPTY_STATE: StarInviteState = { closed: null, nextAt: null, preview: false }

function localDay(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** Distinct local days on which a paper was imported or a note was last written. */
export function activeDays(
  documents: readonly Pick<DocumentRecord, "importedAt">[],
  notes: readonly Pick<ReaderNote, "markdown" | "updatedAt">[],
): number {
  const days = new Set<string>()
  const stamps = [
    ...documents.map((document) => document.importedAt),
    ...notes.filter((note) => note.markdown.trim().length > 0).map((note) => note.updatedAt),
  ]
  for (const stamp of stamps) {
    const day = localDay(stamp)
    if (day !== null) days.add(day)
  }
  return days.size
}

export type StarInviteInput = {
  readonly activeDays: number
  readonly wizardAnswer: GithubStarAnswer | null
  readonly state: StarInviteState
  readonly now: Date
}

/** Whether the one gentle invitation may appear now. */
export function shouldInvite({ activeDays, wizardAnswer, state, now }: StarInviteInput): boolean {
  if (wizardAnswer === "starred" || wizardAnswer === "opened" || state.closed !== null) return false
  if (state.nextAt !== null && Date.parse(state.nextAt) > now.getTime()) return false
  return state.preview || activeDays >= MIN_ACTIVE_DAYS
}

export function snoozed(state: StarInviteState, now: Date): StarInviteState {
  return { ...state, nextAt: new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString() }
}

export function closedAs(state: StarInviteState, how: "opened" | "never"): StarInviteState {
  return { ...state, closed: how }
}

export function readStarInviteState(): StarInviteState {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STAR_INVITE_STORAGE_KEY) ?? "null")
    const parsed = starInviteStateSchema.safeParse(raw)
    if (parsed.success) return parsed.data
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the defaults then apply.
  }
  return EMPTY_STATE
}

export function writeStarInviteState(state: StarInviteState): void {
  try {
    window.localStorage.setItem(STAR_INVITE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // A failed write only means the invitation may appear once more.
  }
}

/** Records that the reader went to the GitHub page, from the card or the 사용법 link. */
export function markStarOpened(): void {
  writeStarInviteState(closedAs(readStarInviteState(), "opened"))
}
