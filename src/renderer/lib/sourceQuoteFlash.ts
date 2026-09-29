const FLASH_CLASS = "source-quote-flash"
const FLASH_MS = 2_600
const RETRY_MS = 150
const RETRIES = 20
/** Long quotes are matched on their opening, which is enough to locate the passage. */
const MATCH_CHARACTERS = 80
/** Shorter quotes match too many places to count as evidence. */
const MIN_QUOTE_CHARACTERS = 16

/** Letters and digits only, so line breaks, hyphenation and spacing never break a match. */
export function normalizedQuoteText(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

/** The normalized opening of a quote that locates it in source text. */
export function quoteMatchTarget(quote: string): string {
  return normalizedQuoteText(quote).slice(0, MATCH_CHARACTERS)
}

/**
 * True when the quote's opening appears in the source text. A quote shorter than the minimum
 * counts only when the whole source is that short, since it would match too many places.
 */
export function sourceContainsQuote(source: string, quote: string): boolean {
  const text = normalizedQuoteText(source)
  const target = quoteMatchTarget(quote)
  return (
    target.length >= Math.min(MIN_QUOTE_CHARACTERS, text.length) &&
    target.length > 0 &&
    text.includes(target)
  )
}

/** Text-layer spans of one page whose characters cover the quote, in reading order. */
export function spansCoveringQuote(
  spans: readonly HTMLElement[],
  quote: string,
): readonly HTMLElement[] {
  const target = quoteMatchTarget(quote)
  if (target.length < 4) return []
  let text = ""
  const ranges = spans.map((span) => {
    const start = text.length
    text += normalizedQuoteText(span.textContent ?? "")
    return { span, start, end: text.length }
  })
  const start = text.indexOf(target)
  if (start === -1) return []
  const end = start + target.length
  return ranges.filter((range) => range.end > start && range.start < end).map((range) => range.span)
}

/**
 * Text-layer spans covering a whole passage. Parsed text can drift from the text layer near its
 * end, so when the full passage is not found it is located by its opening and closing words.
 */
export function spansCoveringPassage(
  spans: readonly HTMLElement[],
  passage: string,
): readonly HTMLElement[] {
  const target = normalizedQuoteText(passage)
  if (target.length < 8) return []
  let text = ""
  const ranges = spans.map((span) => {
    const start = text.length
    text += normalizedQuoteText(span.textContent ?? "")
    return { span, start, end: text.length }
  })
  let start = text.indexOf(target)
  let end = start + target.length
  if (start === -1) {
    const head = target.slice(0, MATCH_CHARACTERS)
    start = text.indexOf(head)
    if (start === -1) return []
    const tail = target.slice(-40)
    const tailAt = text.indexOf(tail, start)
    end = tailAt === -1 ? start + head.length : tailAt + tail.length
  }
  return ranges.filter((range) => range.end > start && range.start < end).map((range) => range.span)
}

/**
 * Briefly highlights a quoted passage once the reader has rendered the page's text layer.
 * Returns without effect when the quote cannot be found; the page jump still happened.
 */
export function flashQuoteOnPage(page: number, quote: string, retries = RETRIES): void {
  const spans = [
    ...document.querySelectorAll<HTMLElement>(`.page[data-page-number="${page}"] .textLayer span`),
  ]
  if (spans.length === 0) {
    if (retries > 0) window.setTimeout(() => flashQuoteOnPage(page, quote, retries - 1), RETRY_MS)
    return
  }
  const matched = spansCoveringQuote(spans, quote)
  for (const span of matched) span.classList.add(FLASH_CLASS)
  window.setTimeout(() => {
    for (const span of matched) span.classList.remove(FLASH_CLASS)
  }, FLASH_MS)
}
