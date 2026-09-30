import type { BoardCard } from "../../shared/schemas"

/** What a card's saved chat may hold (boardCardSchema), and what an AI request's history may. */
export const CARD_CHAT_MESSAGE_MAX = 4_000
export const CARD_CHAT_MESSAGES_MAX = 24

function clampMessage(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= CARD_CHAT_MESSAGE_MAX) return trimmed
  let cut = trimmed.slice(0, CARD_CHAT_MESSAGE_MAX - 1)
  // Never end on half of a surrogate pair.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  return `${cut}…`
}

/**
 * A card chat that can always be saved: a long answer is cut, an empty one dropped and the
 * oldest turns let go. Without this, one long answer left the whole workspace unsaveable.
 */
export function withinCardChatLimits(messages: BoardCard["chat"]): BoardCard["chat"] {
  return messages
    .map((message) => ({ ...message, content: clampMessage(message.content) }))
    .filter((message) => message.content.length > 0)
    .slice(-CARD_CHAT_MESSAGES_MAX)
}
