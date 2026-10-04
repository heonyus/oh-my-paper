import type { SourceDocumentAst } from "../../shared/documentAst"
import type { SourceAnchor } from "../../shared/schemas"
import { type AstSourceRange, pageTextsFromAst } from "./documentAstProjection"

export type LegacyAnchorResolution =
  | { readonly status: "resolved"; readonly ranges: readonly AstSourceRange[] }
  | { readonly status: "ambiguous"; readonly ranges: readonly AstSourceRange[] }
  | { readonly status: "unresolved"; readonly ranges: readonly [] }

function rangesForMatch(
  ast: SourceDocumentAst,
  page: number,
  start: number,
  end: number,
): readonly AstSourceRange[] {
  return ast.items
    .filter(
      (item) =>
        item.pageId === `page:${page}` && item.normalizedStart < end && item.normalizedEnd > start,
    )
    .map((item) => ({
      sourceItemId: item.id,
      page,
      start: Math.max(start, item.normalizedStart),
      end: Math.min(end, item.normalizedEnd),
    }))
}

export function resolveLegacyAnchor(
  ast: SourceDocumentAst,
  anchor: SourceAnchor,
): LegacyAnchorResolution {
  // An empty quote matches at every offset, and indexOf("", past the end) keeps returning the
  // length, so the search below would never end. Structures such as tables can have no quote.
  if (!anchor.quote) return { status: "unresolved", ranges: [] }
  const text = pageTextsFromAst(ast)[anchor.page - 1] ?? ""
  const ranges: AstSourceRange[] = []
  for (
    let start = text.indexOf(anchor.quote);
    start >= 0;
    start = text.indexOf(anchor.quote, start + 1)
  ) {
    ranges.push(...rangesForMatch(ast, anchor.page, start, start + anchor.quote.length))
  }
  const unique = [
    ...new Map(
      ranges.map((range) => [`${range.sourceItemId}:${range.start}:${range.end}`, range]),
    ).values(),
  ]
  if (unique.length === 0) return { status: "unresolved", ranges: [] }
  const matches = new Set(unique.map((range) => `${range.start}:${range.end}`))
  return matches.size === 1
    ? { status: "resolved", ranges: unique }
    : { status: "ambiguous", ranges: unique }
}

export function addAstRangesToAnchor(ast: SourceDocumentAst, anchor: SourceAnchor): SourceAnchor {
  const resolution = resolveLegacyAnchor(ast, anchor)
  if (resolution.status !== "resolved") return anchor
  return {
    ...anchor,
    astRanges: resolution.ranges.map(({ sourceItemId, start, end }) => ({
      sourceItemId,
      start,
      end,
    })),
  }
}
