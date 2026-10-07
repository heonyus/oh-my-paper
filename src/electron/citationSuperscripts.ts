import type { SourceRawItem } from "../shared/documentAst"

/** What a PDF.js text item needs to say whether it is a raised citation number. */
export type LineTextItem = Pick<SourceRawItem, "text" | "transform">

/**
 * "1", "2,3", "4,5–7", "18–20", or one piece of such a run when PDF.js splits it at a dash or
 * comma: the numbers a Nature-style citation superscript carries.
 */
const CITATION_PIECE = /^\s*(?:\d{1,3}(?:\s*[,，–—-]\s*\d{1,3})*\s*[,，–—-]?|[,，–—-])\s*$/u
/** Punctuation that closes onto the citation before it rather than taking a space. */
const CLOSING_PUNCTUATION = /^[.,;:!?)\]]/u
/** A citation sits in a font at most this fraction of the body's. */
const CITATION_SIZE_RATIO = 0.85
/** A citation's baseline is raised by at least this fraction of the body font size. */
const CITATION_RAISE_RATIO = 0.15

function fontSize(item: LineTextItem): number {
  return Math.hypot(item.transform[2], item.transform[3])
}

function sideways(item: LineTextItem): boolean {
  const [a, b] = item.transform
  return Math.abs(b) > Math.abs(a)
}

/** The baseline, measured up the page the way PDF text space runs. */
function baseline(item: LineTextItem): number {
  return item.transform[5]
}

function characterCount(item: LineTextItem): number {
  return item.text.replace(/\s+/gu, "").length
}

/**
 * Which items of one line are citation superscripts: digit runs set in a smaller font and
 * raised above the baseline of the text beside them. Exponents are told apart later, by the
 * digit they follow.
 */
function citationFlags(items: readonly LineTextItem[]): readonly boolean[] {
  const upright = items.filter((item) => !sideways(item) && characterCount(item) > 0)
  const body = upright.reduce<LineTextItem | null>(
    (best, item) => (best && characterCount(best) >= characterCount(item) ? best : item),
    null,
  )
  if (!body) return items.map(() => false)
  const bodySize = fontSize(body)
  if (bodySize <= 0) return items.map(() => false)
  const candidates = items.map(
    (item) =>
      !sideways(item) &&
      CITATION_PIECE.test(item.text) &&
      fontSize(item) <= bodySize * CITATION_SIZE_RATIO,
  )
  const neighbourOf = (index: number): LineTextItem | null => {
    for (let at = index - 1; at >= 0; at -= 1) if (!candidates[at]) return items[at] ?? null
    for (let at = index + 1; at < items.length; at += 1)
      if (!candidates[at]) return items[at] ?? null
    return null
  }
  const raised = items.map((item, index) => {
    if (!candidates[index]) return false
    const neighbour = neighbourOf(index)
    if (!neighbour || sideways(neighbour)) return false
    return baseline(item) - baseline(neighbour) >= bodySize * CITATION_RAISE_RATIO
  })
  // A raised dash or comma is a citation only as part of a run that carries a number.
  const flags = [...raised]
  for (let start = 0; start < flags.length; start += 1) {
    if (!flags[start]) continue
    let end = start
    while (flags[end + 1]) end += 1
    const run = items
      .slice(start, end + 1)
      .map((item) => item.text)
      .join("")
    if (!/\d/u.test(run)) for (let at = start; at <= end; at += 1) flags[at] = false
    start = end
  }
  return flags
}

/**
 * The text of one line's PDF.js items, with each citation superscript written as a bracketed
 * marker attached to the word before it: "difficult", "1", ". Humans" becomes
 * "difficult[1]. Humans" rather than "difficult 1 . Humans". A raised digit right after a
 * digit is an exponent and is left as it was.
 */
export function joinLineText(items: readonly LineTextItem[]): string {
  const flags = citationFlags(items)
  let text = ""
  let pending: string[] = []
  let afterMarker = false
  const flush = (): void => {
    if (pending.length === 0) return
    const numbers = pending.join("")
    const exponent = /\d$/u.test(text)
    text = exponent ? `${text} ${numbers}` : `${text.trimEnd()}[${numbers}]`
    afterMarker = !exponent
    pending = []
  }
  items.forEach((item, index) => {
    if (!item.text) return
    if (flags[index]) {
      pending.push(item.text.replace(/\s+/gu, ""))
      return
    }
    flush()
    const glued = afterMarker && CLOSING_PUNCTUATION.test(item.text.trimStart())
    text = glued ? `${text}${item.text.trimStart()}` : `${text} ${item.text}`
    afterMarker = false
  })
  flush()
  return text.replace(/\s+/gu, " ").trim()
}
