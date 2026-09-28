import { z } from "zod"
import {
  OWN_SUMMARY_LINES,
  type OwnSummaryCheck,
  type OwnSummaryCheckItem,
  type OwnSummaryLine,
  type OwnSummaryLines,
  ownSummaryLineSchema,
  ownSummaryVerdictSchema,
} from "../../shared/ownSummary"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { waitForDocumentAst } from "./documentAstRuntime"
import { pageTextsWithParsedPages, paperOverviewContext } from "./pdfSearch"
import { normalizedQuoteText, quoteMatchTarget } from "./sourceQuoteFlash"

/** Shorter quotes match too many places to count as evidence. */
const MIN_QUOTE_CHARACTERS = 16
const AST_WAIT_MS = 20_000

export const UNVERIFIED_NOTE = "원문에서 이 판단의 근거 문장을 찾지 못해 확인하지 못했습니다."
export const UNANSWERED_NOTE = "AI가 이 줄을 판정하지 않았습니다."

const modelItemSchema = z.object({
  line: ownSummaryLineSchema,
  verdict: ownSummaryVerdictSchema,
  note: z.string().trim().min(1),
  page: z.number().int().positive().nullable().optional(),
  quote: z.string().trim().nullable().optional(),
})
const modelResponseSchema = z.object({ items: z.array(modelItemSchema).max(12) })

type ModelCheckItem = z.infer<typeof modelItemSchema>

export function writtenLines(lines: OwnSummaryLines): readonly OwnSummaryLine[] {
  return OWN_SUMMARY_LINES.filter((line) => lines[line].trim())
}

/** The reader's written lines only; a blank line is not sent for checking. */
export function ownSummaryCheckInput(lines: OwnSummaryLines): string {
  return JSON.stringify(
    Object.fromEntries(writtenLines(lines).map((line) => [line, lines[line].trim()])),
  )
}

export function parseOwnSummaryCheck(value: string): readonly ModelCheckItem[] {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim()
  return modelResponseSchema.parse(JSON.parse(withoutFence)).items
}

function quoteOnPage(pageTexts: readonly string[], page: number, quote: string): boolean {
  const text = pageTexts[page - 1]
  const target = quoteMatchTarget(quote)
  return (
    text !== undefined &&
    target.length >= MIN_QUOTE_CHARACTERS &&
    normalizedQuoteText(text).includes(target)
  )
}

function verifiedItem(
  line: OwnSummaryLine,
  item: ModelCheckItem | undefined,
  pageTexts: readonly string[],
): OwnSummaryCheckItem {
  if (!item)
    return { line, verdict: "unverifiable", note: UNANSWERED_NOTE, page: null, quote: null }
  const note = item.note.slice(0, 400)
  if (item.verdict === "unverifiable")
    return { line, verdict: item.verdict, note, page: null, quote: null }
  const { page, quote } = item
  if (page && quote && quoteOnPage(pageTexts, page, quote)) {
    return { line, verdict: item.verdict, note, page, quote: quote.slice(0, 400) }
  }
  return { line, verdict: "unverifiable", note: UNVERIFIED_NOTE, page: null, quote: null }
}

/**
 * One item per written line, in line order. A verdict whose quote is not on the page it names
 * becomes unverifiable, so the check never asserts something the paper does not show.
 */
export function verifiedCheckItems(
  items: readonly ModelCheckItem[],
  lines: readonly OwnSummaryLine[],
  pageTexts: readonly string[],
): OwnSummaryCheckItem[] {
  return lines.map((line) =>
    verifiedItem(
      line,
      items.find((candidate) => candidate.line === line),
      pageTexts,
    ),
  )
}

export async function checkOwnSummary(
  document: DocumentRecord,
  lines: OwnSummaryLines,
  onAiRequest: AiRequestRunner,
  signal?: AbortSignal,
): Promise<OwnSummaryCheck> {
  const response = await onAiRequest(
    {
      action: "own_summary_check",
      page: 1,
      quote: ownSummaryCheckInput(lines),
      paperContext: paperOverviewContext() || document.overview || document.title,
      before: "",
      after: "",
    },
    undefined,
    signal,
  )
  const items = parseOwnSummaryCheck(response)
  const ast = await waitForDocumentAst(document.id, AST_WAIT_MS, signal)
  const pageTexts = ast ? pageTextsWithParsedPages(ast) : []
  return {
    checkedAt: new Date().toISOString(),
    items: verifiedCheckItems(items, writtenLines(lines), pageTexts),
  }
}
