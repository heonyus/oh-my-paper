import { claudeModelHasLargeContext, DEFAULT_CLAUDE_MODEL } from "../../shared/claudeTypes"
import type { AiRequest, ProviderStatus } from "../../shared/ipc"
import type { DocumentId } from "../../shared/schemas"
import { waitForDocumentAst } from "./documentAstRuntime"
import { pageTextsWithParsedPages } from "./pdfSearch"

/** Actions that reason about the paper as a whole rather than a selected passage. */
const WHOLE_PAPER_ACTIONS: ReadonlySet<AiRequest["action"]> = new Set([
  "chat",
  "paper_summary",
  "three_line_summary",
  "keywords",
])

/** Paper-level tools start on open, often before the reader has loaded the AST. */
const AST_WAIT_MS = 20_000

export function usesWholePaper(action: AiRequest["action"]): boolean {
  return WHOLE_PAPER_ACTIONS.has(action)
}

/**
 * Characters of paper text sent with each whole-paper request. Claude Sonnet, Opus and Haiku 5.5 take
 * a 1M-token context through the subscription, Haiku 4.x 200K; API keys are billed and
 * rate-limited per token, so they get a bounded excerpt of the paper in reading order.
 */
export function wholePaperCharacterBudget(
  provider: Pick<ProviderStatus, "mode" | "claudeModel">,
): number {
  switch (provider.mode) {
    case "claude":
      return claudeModelHasLargeContext(provider.claudeModel ?? DEFAULT_CLAUDE_MODEL)
        ? 600_000
        : 300_000
    case "chatgpt":
      return 200_000
    default:
      return 24_000
  }
}

/** Joins pages in reading order, dropping whole trailing pages once the budget is spent. */
export function formatWholePaper(pageTexts: readonly string[], budget: number): string {
  const pages: string[] = []
  let used = 0
  let lastIncluded = 0
  for (const [index, raw] of pageTexts.entries()) {
    const text = raw
      .replace(/[ \t]+/gu, " ")
      .replace(/\n{3,}/gu, "\n\n")
      .trim()
    if (!text) continue
    const page = `[Page ${index + 1}]\n${text}`
    if (used + page.length > budget) break
    pages.push(page)
    used += page.length + 2
    lastIncluded = index + 1
  }
  if (pages.length === 0) return ""
  const total = pageTexts.length
  const header =
    lastIncluded < total
      ? `FULL PAPER TEXT in reading order: pages 1-${lastIncluded} of ${total}. Later pages were omitted for length; say so when a question needs them.`
      : `FULL PAPER TEXT in reading order: all ${total} pages.`
  return `${header}\n\n${pages.join("\n\n")}`
}

export async function wholePaperText(
  documentId: DocumentId,
  budget: number,
  signal?: AbortSignal,
): Promise<string> {
  const ast = await waitForDocumentAst(documentId, AST_WAIT_MS, signal)
  return ast ? formatWholePaper(pageTextsWithParsedPages(ast), budget) : ""
}
