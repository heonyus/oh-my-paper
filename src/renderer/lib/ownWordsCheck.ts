import { z } from "zod"
import type { AiRequest } from "../../shared/ipc"
import { ownSummaryVerdictSchema } from "../../shared/ownSummary"
import { OWN_WORDS_MAX_CHARACTERS, type OwnWordsCheck } from "../../shared/ownWords"
import type { AiRequestRunner, BoardCard } from "../types"
import { parseJsonReply } from "./jsonReply"
import { sourceContainsQuote, UNVERIFIED_NOTE } from "./ownSummaryCheck"

const modelCheckSchema = z.object({
  verdict: ownSummaryVerdictSchema,
  note: z.string().trim().min(1),
  quote: z.string().trim().nullable().optional(),
})

/** The text of a `내 말로` card that a check covers. */
export function ownWordsText(card: BoardCard): string {
  return card.body.trim().slice(0, OWN_WORDS_MAX_CHARACTERS)
}

export function ownWordsCheckRequest(card: BoardCard): Omit<AiRequest, "documentId"> {
  return {
    action: "own_words_check",
    page: card.anchor.page,
    quote: ownWordsText(card),
    sourceEvidence: `SELECTED PASSAGE (page ${card.anchor.page}):\n${card.anchor.quote}`.slice(
      0,
      12_000,
    ),
    before: "",
    after: "",
  }
}

/** A verdict stands only with a quote from the selected passage; otherwise it is unverifiable. */
export function verifiedOwnWordsCheck(
  reply: string,
  passage: string,
  text: string,
  checkedAt: string,
): OwnWordsCheck {
  const parsed = modelCheckSchema.parse(parseJsonReply(reply))
  const note = parsed.note.slice(0, 400)
  if (parsed.verdict === "unverifiable")
    return { checkedAt, text, verdict: parsed.verdict, note, quote: null }
  const quote = parsed.quote
  if (quote && sourceContainsQuote(passage, quote)) {
    return { checkedAt, text, verdict: parsed.verdict, note, quote: quote.slice(0, 400) }
  }
  return { checkedAt, text, verdict: "unverifiable", note: UNVERIFIED_NOTE, quote: null }
}

export async function checkOwnWords(
  card: BoardCard,
  onAiRequest: AiRequestRunner,
  signal?: AbortSignal,
): Promise<OwnWordsCheck> {
  const reply = await onAiRequest(ownWordsCheckRequest(card), undefined, signal)
  return verifiedOwnWordsCheck(
    reply,
    card.anchor.quote,
    ownWordsText(card),
    new Date().toISOString(),
  )
}
