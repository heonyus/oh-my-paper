import type { JSONContent } from "@tiptap/core"
import { evidenceQuote } from "./evidenceNode"

export type PendingNoteQuote = {
  readonly id: string
  readonly page: number
  readonly quote: string
}

/**
 * A passage brought from the PDF: the source as a quote with its evidence chip, then an empty
 * paragraph where the reader writes what it means in their own words.
 */
export function noteQuoteContent(page: number, quote: string): JSONContent[] {
  const text = quote.replace(/\s+/gu, " ").trim()
  return [
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: `${text} ` },
            { type: "evidence", attrs: { page, quote: evidenceQuote(text) } },
          ],
        },
      ],
    },
    { type: "paragraph" },
  ]
}
