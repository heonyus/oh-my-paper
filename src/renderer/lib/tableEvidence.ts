import type { ParsedDocumentPage, ParsedPageBlock } from "../../shared/documentPageModel"
import { AI_SOURCE_EVIDENCE_MAX_CHARACTERS } from "../../shared/ipc"
import type { SourceFragment } from "../../shared/schemas"
import { paperContextForQuestion } from "./pdfSearch"
import type { DetectedStructure } from "./structureDetector"

type NumericCell = {
  readonly value: number
  readonly display: string
  readonly unit: string
}

const numericCellPattern =
  /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+)|(?:\d+))(?:\.\d+)?(?:[eE][+-]?\d+)?\s*(%|[KMB])?$/iu

function overlapRatio(left: SourceFragment, right: ParsedPageBlock["bounds"]): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return (width * height) / Math.max(1, right.width * right.height)
}

function pageBoundsForStructure(
  structure: DetectedStructure,
  page: ParsedDocumentPage,
  renderedWidth: number,
  renderedHeight: number,
): ParsedPageBlock["bounds"] {
  return {
    x: (structure.bounds.x * page.width) / renderedWidth,
    y: (structure.bounds.y * page.height) / renderedHeight,
    width: (structure.bounds.width * page.width) / renderedWidth,
    height: (structure.bounds.height * page.height) / renderedHeight,
  }
}

function tableBlocksForStructure(
  page: ParsedDocumentPage,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
): readonly ParsedPageBlock[] {
  const pageBounds = pageBoundsForStructure(structure, page, renderedWidth, renderedHeight)
  return page.blocks
    .filter((block) => block.label === "table")
    .filter((block) => block.id === structure.id || overlapRatio(pageBounds, block.bounds) >= 0.12)
    .sort((left, right) => left.order - right.order)
}

function parseNumericCell(value: string): NumericCell | null {
  const cleaned = value.trim().replace(/[*_`]/gu, "")
  const match = cleaned.match(numericCellPattern)
  if (!match) return null
  const unit = match[1]?.toUpperCase() ?? ""
  const numberText = cleaned.slice(0, cleaned.length - (match[1]?.length ?? 0)).trim()
  const number = Number(numberText.replaceAll(",", ""))
  if (!Number.isFinite(number)) return null
  return { value: number, display: cleaned, unit }
}

function markdownCells(line: string): readonly string[] {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return []
  const withoutEdges = trimmed.replace(/^\|/u, "").replace(/\|$/u, "")
  return withoutEdges.split("|").map((cell) => cell.trim())
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/u.test(cell))
}

function numericFacts(markdown: string): readonly string[] {
  const rows = markdown
    .split(/\r?\n/u)
    .map(markdownCells)
    .filter((cells) => cells.length > 1 && !isSeparatorRow(cells))
  const header = rows[0]
  if (!header) return []
  const facts: string[] = []
  for (let column = 0; column < header.length; column += 1) {
    const values = rows.slice(1).flatMap((row) => {
      const cell = row[column]
      if (!cell) return []
      const numeric = parseNumericCell(cell)
      return numeric ? [numeric] : []
    })
    const units = new Set(values.map((value) => value.unit))
    for (const unit of units) {
      const comparable = values.filter((value) => value.unit === unit)
      if (comparable.length < 2) continue
      const maximum = comparable.reduce((best, value) => (value.value > best.value ? value : best))
      const minimum = comparable.reduce((best, value) => (value.value < best.value ? value : best))
      const name = header[column] || `열 ${column + 1}`
      facts.push(`열 "${name}"의 최대값은 ${maximum.display}, 최소값은 ${minimum.display}입니다.`)
    }
  }
  return facts
}

function tableMarkdownForStructure(
  page: ParsedDocumentPage,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
): string | null {
  const blocks = tableBlocksForStructure(page, structure, renderedWidth, renderedHeight)
  const markdown = blocks
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join("\n\n")
  return markdown || null
}

function tableHeaderQuery(markdown: string): string {
  const header = markdown
    .split(/\r?\n/u)
    .map(markdownCells)
    .find((cells) => cells.length > 1 && !isSeparatorRow(cells))
  return header?.join(" ") ?? ""
}

function tableHeaderTerms(markdown: string): readonly string[] {
  const header = markdown
    .split(/\r?\n/u)
    .map(markdownCells)
    .find((cells) => cells.length > 1 && !isSeparatorRow(cells))
  return (header ?? [])
    .map((cell) =>
      cell
        .replace(/[\\{}_$^*`]/gu, " ")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter((cell) => /[\p{L}\p{N}]/u.test(cell))
}

export function tableDefinitionEvidenceForStructure(
  page: ParsedDocumentPage | null,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
  nearbyContext: string,
): string {
  if (!page || structure.kind !== "table") return ""
  const markdown = tableMarkdownForStructure(page, structure, renderedWidth, renderedHeight)
  if (!markdown) return ""
  const terms = [...tableHeaderTerms(markdown)].sort((left, right) => {
    const leftPriority = /epsilon|ε/iu.test(left) ? 0 : 1
    const rightPriority = /epsilon|ε/iu.test(right) ? 0 : 1
    return leftPriority - rightPriority
  })
  const contextsByTerm = terms.map((term) => {
    const related = /epsilon|ε/iu.test(term)
      ? paperContextForQuestion(`${term} smoothing`, structure.page)
      : ""
    const exact = paperContextForQuestion(term, structure.page)
    const definitions = paperContextForQuestion(
      `${term} definition meaning regularization`,
      structure.page,
    )
    return [...related.split(/\n\n+/u), ...exact.split(/\n\n+/u), ...definitions.split(/\n\n+/u)]
      .map((block) => block.trim())
      .filter(Boolean)
  })
  const contexts = new Set<string>()
  for (let blockIndex = 0; blockIndex < 8; blockIndex += 1) {
    for (const termContexts of contextsByTerm) {
      const block = termContexts[blockIndex]
      if (block) contexts.add(block)
    }
  }
  const boundedContexts: string[] = []
  for (const context of contexts) {
    const next = [...boundedContexts, context].join("\n\n")
    if (next.length > 3_500) break
    boundedContexts.push(context)
  }
  if (boundedContexts.length === 0) {
    return paperContextForQuestion(
      `${structure.quote} ${tableHeaderQuery(markdown)} ${nearbyContext} definition meaning`,
      structure.page,
    ).slice(0, 3_500)
  }
  return boundedContexts.join("\n\n")
}

const tableSourceHeading = "표 OCR Markdown 원문(셀 근거):"
const evidenceSeparator = "\n\n"

function tableEvidenceParts(
  page: ParsedDocumentPage | null,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
): { readonly markdown: string; readonly facts: string } | null {
  if (!page || structure.kind !== "table" || renderedWidth <= 0 || renderedHeight <= 0) return null
  const markdown = tableMarkdownForStructure(page, structure, renderedWidth, renderedHeight)
  if (!markdown) return null
  const facts = numericFacts(markdown)
  return { markdown, facts: facts.length > 0 ? `표에서 확인한 수치:\n- ${facts.join("\n- ")}` : "" }
}

export function tableEvidenceForStructure(
  page: ParsedDocumentPage | null,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
): string | null {
  const parts = tableEvidenceParts(page, structure, renderedWidth, renderedHeight)
  if (!parts) return null
  return [tableSourceHeading, parts.markdown, parts.facts].filter(Boolean).join(evidenceSeparator)
}

export function tableVerifiedFactsForStructure(
  page: ParsedDocumentPage | null,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
): readonly string[] {
  if (!page || structure.kind !== "table" || renderedWidth <= 0 || renderedHeight <= 0) return []
  const markdown = tableMarkdownForStructure(page, structure, renderedWidth, renderedHeight)
  return markdown ? numericFacts(markdown) : []
}

export function tableCardBody(
  body: string,
  facts: readonly string[],
  definitionEvidence: string,
): string {
  const withoutUnverifiedExtrema =
    facts.length === 0
      ? body
      : body
          .split("\n")
          .filter(
            (line) =>
              !(
                /(?:최대|최소|최고|최저|가장\s+(?:큰|작은)|maximum|minimum|highest|lowest)/iu.test(
                  line,
                ) && /\d/u.test(line)
              ),
          )
          .join("\n")
  return [
    withoutUnverifiedExtrema,
    facts.length > 0 ? `### 표에서 확인한 수치\n- ${facts.join("\n- ")}` : "",
    definitionEvidence ? `### 문서 정의 근거\n${definitionEvidence}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function verifiedTableBody(
  page: ParsedDocumentPage | null,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
  nearbyContext: string,
  body: string,
): string {
  return tableCardBody(
    body,
    tableVerifiedFactsForStructure(page, structure, renderedWidth, renderedHeight),
    tableDefinitionEvidenceForStructure(
      page,
      structure,
      renderedWidth,
      renderedHeight,
      nearbyContext,
    ),
  )
}

const retrievedEvidenceHeading = "표 관련 문서 근거(정의와 해석):\n"
/** Document passages shorter than this say nothing worth the space; the table keeps it. */
const minimumRetrievedCharacters = 240

/** Cuts text to fit, at the last line break when one falls in the final third. */
function clipAtLineBreak(text: string, maximumCharacters: number): string {
  if (text.length <= maximumCharacters) return text
  const head = text.slice(0, maximumCharacters)
  const lineBreak = head.lastIndexOf("\n")
  return (
    lineBreak >= Math.floor(maximumCharacters * 0.66) ? head.slice(0, lineBreak) : head
  ).trimEnd()
}

/**
 * The table's cells and extrema come first, then the retrieved passages fill what is left of
 * the request's evidence field. A page-sized table that alone exceeds the field loses its
 * last rows, keeping its header rows and column extrema, instead of the whole request: the
 * server refuses evidence past the limit.
 */
export function tableEvidenceWithDocumentContext(
  page: ParsedDocumentPage | null,
  structure: DetectedStructure,
  renderedWidth: number,
  renderedHeight: number,
  nearbyContext: string,
  maximumCharacters = AI_SOURCE_EVIDENCE_MAX_CHARACTERS,
): string | null {
  const parts = tableEvidenceParts(page, structure, renderedWidth, renderedHeight)
  if (!parts) return null
  const fixed = [tableSourceHeading, parts.facts].filter(Boolean)
  const markdownBudget =
    maximumCharacters -
    fixed.reduce((total, part) => total + part.length, 0) -
    evidenceSeparator.length * fixed.length
  const table = [
    tableSourceHeading,
    clipAtLineBreak(parts.markdown, Math.max(0, markdownBudget)),
    parts.facts,
  ]
    .filter(Boolean)
    .join(evidenceSeparator)
  const retrieved = tableDefinitionEvidenceForStructure(
    page,
    structure,
    renderedWidth,
    renderedHeight,
    nearbyContext,
  )
  const remaining =
    maximumCharacters - table.length - evidenceSeparator.length - retrievedEvidenceHeading.length
  if (!retrieved || remaining < minimumRetrievedCharacters) return table
  return `${table}${evidenceSeparator}${retrievedEvidenceHeading}${clipAtLineBreak(retrieved, remaining)}`
}
