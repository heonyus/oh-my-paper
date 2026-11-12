import type { CardId } from "../types"

/** What becomes of a memo once the reader leaves it: kept on the board, or thrown away empty. */
export type QuickMemoOutcome = "keep" | "discard"

/**
 * Memos the reader has just opened with `N` and not yet left. Such a memo starts with the caret
 * in it, and the first time focus leaves it, it settles: its text goes to the page's note, or the
 * memo is removed when nothing was written. The board draws the memo; the app owns the note, so
 * the two meet here.
 */
const pending = new Map<CardId, (body: string) => QuickMemoOutcome>()

export function trackQuickMemo(id: CardId, settle: (body: string) => QuickMemoOutcome): void {
  pending.set(id, settle)
}

export function isQuickMemo(id: CardId): boolean {
  return pending.has(id)
}

/** Settles the memo with the text it holds now; null when it was not a quick memo. */
export function settleQuickMemo(id: CardId, body: string): QuickMemoOutcome | null {
  const settle = pending.get(id)
  if (!settle) return null
  pending.delete(id)
  return settle(body)
}
