import type { ParsedDocumentPage, ParsedPageBlock } from "../../shared/documentPageModel"

const PARAGRAPH_LABELS: ReadonlySet<ParsedPageBlock["label"]> = new Set([
  "text",
  "list",
  "figure_title",
  "table_title",
])
const HEADING_LABELS: ReadonlySet<ParsedPageBlock["label"]> = new Set([
  "paragraph_title",
  "doc_title",
])
const MIN_PARAGRAPH_CHARACTERS = 40
const MAX_PARAGRAPH_CHARACTERS = 1_600

export type PageParagraph = {
  readonly id: string
  readonly page: number
  /** Plain source text, shown to the reader and matched against the PDF text layer. */
  readonly text: string
  /** The section heading above the paragraph, which sharpens matching by meaning. */
  readonly heading: string
}

/** Markdown and LaTeX markup from the layout model reduced to the words a reader sees. */
export function plainSourceText(content: string): string {
  return content
    .replace(/^\s*(?:#{1,6}|[-*+•])\s+/gmu, "")
    .replace(/\$+/gu, " ")
    .replace(/\\[a-zA-Z]+/gu, " ")
    .replace(/[{}^_]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}

type Line = {
  readonly id: string
  readonly text: string
  readonly bounds: ParsedPageBlock["bounds"]
}

/** A new paragraph starts after a vertical gap or when the text jumps to another column. */
function continuesParagraph(previous: Line, line: Line): boolean {
  const gap = line.bounds.y - (previous.bounds.y + previous.bounds.height)
  const newColumn = line.bounds.x > previous.bounds.x + previous.bounds.width * 0.5
  return gap <= previous.bounds.height * 0.6 && gap > -previous.bounds.height && !newColumn
}

function paragraphsFromLines(page: ParsedDocumentPage): readonly PageParagraph[] {
  const lines: Line[] = [...page.blocks]
    .sort((left, right) => left.order - right.order)
    .filter((block) => PARAGRAPH_LABELS.has(block.label))
    .map((block) => ({ id: block.id, text: plainSourceText(block.content), bounds: block.bounds }))
  const groups: Line[][] = []
  for (const line of lines) {
    const current = groups.at(-1)
    const previous = current?.at(-1)
    if (current && previous && continuesParagraph(previous, line)) current.push(line)
    else groups.push([line])
  }
  return groups.flatMap((group) => {
    const first = group[0]
    const text = group
      .map((line) => line.text)
      .join(" ")
      .trim()
    return first && text.length >= MIN_PARAGRAPH_CHARACTERS
      ? [
          {
            id: first.id,
            page: page.pageNumber,
            text: text.slice(0, MAX_PARAGRAPH_CHARACTERS),
            heading: "",
          },
        ]
      : []
  })
}

/**
 * A page's paragraphs in reading order. The layout model's paragraphs are used when present;
 * otherwise the parser's lines are joined back into paragraphs by their spacing.
 */
export function pageParagraphs(page: ParsedDocumentPage): readonly PageParagraph[] {
  const layout = [...(page.layout ?? [])].sort((left, right) => left.order - right.order)
  if (!layout.some((block) => PARAGRAPH_LABELS.has(block.label))) return paragraphsFromLines(page)
  const paragraphs: PageParagraph[] = []
  let heading = ""
  for (const block of layout) {
    if (HEADING_LABELS.has(block.label)) {
      heading = plainSourceText(block.content)
      continue
    }
    if (!PARAGRAPH_LABELS.has(block.label)) continue
    const text = plainSourceText(block.content)
    if (text.length < MIN_PARAGRAPH_CHARACTERS) continue
    paragraphs.push({
      id: `page:${page.pageNumber}:layout:${block.order}`,
      page: page.pageNumber,
      text: text.slice(0, MAX_PARAGRAPH_CHARACTERS),
      heading,
    })
  }
  return paragraphs
}
