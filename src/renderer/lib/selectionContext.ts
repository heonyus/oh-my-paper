import type { BoardTextSelection } from "./boardSelection"
import { pageTextsFromAst } from "./documentAstProjection"
import { activeDocumentAst } from "./documentAstRuntime"
import { sectionRequestContext } from "./sectionContext"

/** Enough preceding text to hold the paragraph a passage refers back to ("in these cases"). */
const BEFORE_CHARACTERS = 2_400
const AFTER_CHARACTERS = 900

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

/** The text with whitespace removed and ligatures expanded, mapped back to source offsets. */
function compactForm(text: string): { readonly text: string; readonly offsets: readonly number[] } {
  let compact = ""
  const offsets: number[] = []
  let offset = 0
  for (const character of text) {
    for (const unit of character.normalize("NFKC").replace(/[\s­]+/gu, "")) {
      compact += unit
      offsets.push(offset)
    }
    offset += character.length
  }
  return { text: compact, offsets }
}

/**
 * Where `quote` sits in `pageText`. A selection's text rarely matches the text layer exactly:
 * lines join without a space, words break with a hyphen, and ligatures differ, so a failed exact
 * match falls back to comparing both with whitespace removed.
 */
export function locateQuote(
  pageText: string,
  quote: string,
): { readonly start: number; readonly end: number } | null {
  const exact = pageText.indexOf(quote)
  if (exact >= 0) return { start: exact, end: exact + quote.length }
  const page = compactForm(pageText)
  const target = compactForm(quote).text
  if (!target) return null
  const index = page.text.indexOf(target)
  if (index < 0) return null
  const start = page.offsets[index] ?? 0
  const last = page.offsets[index + target.length - 1] ?? start
  // The offset of the last matched unit's source character, plus that character's length.
  const end = last + ([...pageText.slice(last)][0]?.length ?? 1)
  return { start, end }
}

/** Text of a neighboring page from the document AST, which holds pages the viewer has not drawn. */
function astPageText(page: number): string {
  if (page < 1) return ""
  const ast = activeDocumentAst()
  if (!ast) return ""
  return normalizeWhitespace(pageTextsFromAst(ast)[page - 1] ?? "")
}

/**
 * The text before and after `quote` on its page, running into the neighbouring pages near the
 * page's edges. Null when the page is not drawn or the quote is not found on it.
 */
function contextAround(
  pageElement: HTMLElement,
  pageNumber: number,
  quoteText: string,
): { readonly before: string; readonly after: string } | null {
  const pageText = normalizeWhitespace(
    [...pageElement.querySelectorAll<HTMLSpanElement>(".textLayer span")]
      .map((span) => span.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" "),
  )
  const found = locateQuote(pageText, normalizeWhitespace(quoteText))
  if (!found) return null
  let before = pageText.slice(Math.max(0, found.start - BEFORE_CHARACTERS), found.start)
  let after = pageText.slice(found.end, found.end + AFTER_CHARACTERS)
  // A passage near the top of a page refers back to the end of the previous one.
  if (found.start < BEFORE_CHARACTERS) {
    const previous = astPageText(pageNumber - 1)
    if (previous)
      before = `${previous.slice(-(BEFORE_CHARACTERS - found.start))} ${before}`.trimStart()
  }
  if (pageText.length - found.end < AFTER_CHARACTERS) {
    const next = astPageText(pageNumber + 1)
    if (next) after = `${after} ${next.slice(0, AFTER_CHARACTERS - after.length)}`.trimEnd()
  }
  return { before, after }
}

export function addSelectionContext(
  selection: BoardTextSelection,
  pageElement: HTMLElement,
): BoardTextSelection {
  const context = contextAround(pageElement, selection.page, selection.quote)
  if (!context) return selection
  const section = selectedHeadingSection(selection, pageElement)
  return {
    ...selection,
    context: section ? { ...context, section } : context,
  }
}

/**
 * The surroundings of a passage a card is anchored to, for asking about it again without the
 * reader selecting it a second time. Empty when its page is not on screen.
 */
export function passageContext(
  pageNumber: number,
  quoteText: string,
): { readonly before: string; readonly after: string } {
  const pageElement = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
  return (
    (pageElement && contextAround(pageElement, pageNumber, quoteText)) ?? { before: "", after: "" }
  )
}
