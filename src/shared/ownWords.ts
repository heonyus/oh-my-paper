import { z } from "zod"
import { ownSummaryVerdictSchema } from "./ownSummary"

export const OWN_WORDS_MAX_CHARACTERS = 2_000

/**
 * The check of a `내 말로` card against its selected passage. `text` is the card body that was
 * checked, so an edit after the check shows the result as out of date instead of reusing it.
 */
export const ownWordsCheckSchema = z.object({
  checkedAt: z.string().datetime(),
  text: z.string().max(OWN_WORDS_MAX_CHARACTERS),
  verdict: ownSummaryVerdictSchema,
  note: z.string().trim().min(1).max(400),
  quote: z.string().trim().min(1).max(400).nullable(),
})

export type OwnWordsCheck = z.infer<typeof ownWordsCheckSchema>
