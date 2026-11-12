import type { SourceDocumentAst } from "../../shared/documentAst"
import type { DocumentKind, SourceFragment } from "../../shared/schemas"
import type { PageSourceBlock } from "./pageTranslationSource"
import type { CitationIndexEntry } from "./pdfCitationIndex"
import type { PreparedSummary } from "./pdfDocumentFeatures"
import type { PdfOutlineEntry } from "./pdfOutline"
import type { DetectedStructure } from "./structureDetector"

export type AstSourceRange = {
  readonly sourceItemId: string
  readonly page: number
  readonly start: number
  readonly end: number
}

export type ProjectedOutlineEntry = PdfOutlineEntry & {
  readonly sourceItemId: string
  readonly sourceRange: AstSourceRange
}

export type ProjectedStructure = DetectedStructure & {
  readonly sourceRange: AstSourceRange
}

export type ProjectedPageSourceBlock = PageSourceBlock & {
  readonly sourceRange: AstSourceRange
}

export type ProjectedCitationIndexEntry = CitationIndexEntry & {
  readonly sourceRanges: readonly AstSourceRange[]
}

type AstItem = SourceDocumentAst["items"][number]

const itemsByPageOfAst = new WeakMap<SourceDocumentAst, ReadonlyMap<string, readonly AstItem[]>>()

/**
 * Every page's items in reading order, grouped in one pass over the paper and kept for as long
 * as its AST is. Filtering the whole paper's items once per page made each of these projections
 * cost pages × items, on the main thread, each time a paper was opened.
 */
function itemsByPage(ast: SourceDocumentAst): ReadonlyMap<string, readonly AstItem[]> {
  const known = itemsByPageOfAst.get(ast)
  if (known) return known
  const grouped = new Map<string, AstItem[]>()
  for (const item of ast.items) {
    const items = grouped.get(item.pageId)
    if (items) items.push(item)
    else grouped.set(item.pageId, [item])
  }
  for (const items of grouped.values())
    items.sort(
      (left, right) =>
        left.normalizedStart - right.normalizedStart || left.id.localeCompare(right.id),
    )
  itemsByPageOfAst.set(ast, grouped)
  return grouped
}

function itemsForPage(ast: SourceDocumentAst, page: number): readonly AstItem[] {
  return itemsByPage(ast).get(`page:${page}`) ?? []
}

function pageText(items: readonly AstItem[]): string {
  let text = ""
  for (const item of items) {
    if (item.normalizedStart > text.length) text += " ".repeat(item.normalizedStart - text.length)
    text += item.text
  }
  return text.trim()
}

const pageTextsOfAst = new WeakMap<SourceDocumentAst, readonly string[]>()

export function pageTextsFromAst(ast: SourceDocumentAst): readonly string[] {
  const known = pageTextsOfAst.get(ast)
  if (known) return known
  const texts = ast.pages
    .slice()
    .sort((left, right) => left.page - right.page)
    .map((page) => pageText(itemsForPage(ast, page.page)))
  pageTextsOfAst.set(ast, texts)
  return texts
}

export function preparedSummaryFromAst(
  ast: SourceDocumentAst,
  input: { readonly title: string; readonly kind: DocumentKind },
): PreparedSummary {
  const pageTexts = pageTextsFromAst(ast)
  const textCharacters = pageTexts.reduce((total, text) => total + text.length, 0)
  return {
    pages: ast.pages.length,
    title: input.title,
    textCharacters,
    anchorCount: pageTexts.reduce(
      (total, text) => total + (text.match(/[^.!?\n]+(?:[.!?]+|$)/gu)?.length ?? 0),
      0,
    ),
    needsOcr: textCharacters < ast.pages.length * 24,
    kind: input.kind,
  }
}

function itemRange(item: SourceDocumentAst["items"][number], page: number): AstSourceRange {
  return { sourceItemId: item.id, page, start: item.normalizedStart, end: item.normalizedEnd }
}

function itemBounds(item: SourceDocumentAst["items"][number]): SourceFragment {
  return item.bounds
}

export function outlineFromAst(ast: SourceDocumentAst): readonly ProjectedOutlineEntry[] {
  return ast.items.flatMap((item) => {
    const title = item.text.trim()
    if (
      !/^(?:Abstract|Introduction|Background|Methods?|Methodology|Results|Discussion|Conclusion|References|\d+(?:\.\d+)*)\b/iu.test(
        title,
      )
    )
      return []
    const sourceRange = itemRange(item, Number(item.pageId.slice("page:".length)))
    return [{ title, page: sourceRange.page, sourceItemId: item.id, sourceRange }]
  })
}

export function structuresFromAst(ast: SourceDocumentAst): readonly ProjectedStructure[] {
  return ast.items.flatMap((item) => {
    const text = item.text.trim()
    const match = text.match(/^(Figure|Fig\.?|Table|Tab\.?)\s*(\d+)[:.\s]+(.+)$/iu)
    if (!match?.[1] || !match[2] || !match[3]) return []
    const page = Number(item.pageId.slice("page:".length))
    const kind: DetectedStructure["kind"] = /table/iu.test(match[1]) ? "table" : "figure"
    const sourceRange = itemRange(item, page)
    return [
      {
        id: item.id,
        kind,
        page,
        title: `${match[1]} ${match[2]}: ${match[3]}`,
        quote: text,
        bounds: itemBounds(item),
        sourceRange,
      },
    ]
  })
}

export function pageSourceBlocksFromAst(
  ast: SourceDocumentAst,
  page: number,
): readonly ProjectedPageSourceBlock[] {
  return itemsForPage(ast, page).map((item) => ({
    id: item.id,
    kind: /^(?:Abstract|Introduction|Background|Methods?|Results|Discussion|Conclusion)\b/iu.test(
      item.text.trim(),
    )
      ? "heading"
      : "body",
    source: item.text,
    sourceRange: itemRange(item, page),
  }))
}

export function citationIndexFromAst(
  ast: SourceDocumentAst,
): readonly ProjectedCitationIndexEntry[] {
  const entries = new Map<string, ProjectedCitationIndexEntry>()
  for (const page of ast.pages) {
    for (const item of itemsForPage(ast, page.page)) {
      for (const match of item.text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/gu)) {
        const key = match[1]
        if (!key) continue
        const sourceRange = itemRange(item, page.page)
        const current = entries.get(key)
        entries.set(
          key,
          current
            ? { ...current, sourceRanges: [...current.sourceRanges, sourceRange] }
            : {
                key,
                title: `Citation [${key}]`,
                authors: "",
                year: null,
                venue: "",
                rawText: match[0],
                doi: null,
                contexts: [{ page: page.page, text: item.text }],
                sourceRanges: [sourceRange],
              },
        )
      }
    }
  }
  return [...entries.values()]
}
