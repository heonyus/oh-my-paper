import type { BoardTextSelection } from "./boardSelection"
import { sectionRequestContext } from "./sectionContext"

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim()
}

function headingKey(text: string): string {
  return normalizeWhitespace(text)
    .replace(/[.:]+$/u, "")
    .toLocaleLowerCase()
}

function selectedHeadingSection(selection: BoardTextSelection, pageElement: HTMLElement): string {
  if (selection.quote.length > 180) return ""
  const quote = headingKey(selection.quote)
  const heading = [...pageElement.querySelectorAll<HTMLElement>(".textLayer span")].find(
    (span) => headingKey(span.textContent ?? "") === quote,
  )
  const viewer = pageElement.closest<HTMLElement>(".board-viewport") ?? pageElement.parentElement
  if (!heading || !viewer) return ""
  const pageRect = pageElement.getBoundingClientRect()
  const headingRect = heading.getBoundingClientRect()
  return sectionRequestContext({
    viewer,
    page: pageElement,
    heading: heading.textContent?.trim() ?? selection.quote,
    bounds: {
      x: headingRect.left - pageRect.left,
      y: headingRect.top - pageRect.top,
      width: headingRect.width,
      height: headingRect.height,
    },
    paperTitle: "",
  }).section
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
  const section = selectedHeadingSection(selection, pageElement)
  const context = {
    before: pageText.slice(Math.max(0, start - 700), start),
    after: pageText.slice(start + quote.length, start + quote.length + 700),
  }
  return {
    ...selection,
    context: section ? { ...context, section } : context,
  }
}
