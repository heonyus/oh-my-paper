import type { BoardTextSelection } from "./boardSelection"

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim()
}

export function addSelectionContext(
  selection: BoardTextSelection,
  pageElement: HTMLElement,
): BoardTextSelection {
  const pageText = normalizeWhitespace(
    [...pageElement.querySelectorAll<HTMLSpanElement>(".textLayer span")]
      .map((span) => span.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" "),
  )
  const quote = normalizeWhitespace(selection.quote)
  const start = pageText.indexOf(quote)
  if (start < 0) return selection
  return {
    ...selection,
    context: {
      before: pageText.slice(Math.max(0, start - 700), start),
      after: pageText.slice(start + quote.length, start + quote.length + 700),
    },
  }
}
