import type { AiAction, ProviderStatus } from "../../shared/ipc"
import type { DocumentInsightKind } from "../../shared/schemas"
import type { DocumentRecord } from "../types"
import { pageTextsWithParsedPages } from "./pdfSearch"
import { groundedAiRequest } from "./usePaperAiRequest"
import { formatWholePaper, wholePaperCharacterBudget } from "./wholePaperContext"

export const OVERVIEW_ACTIONS: Readonly<Record<DocumentInsightKind, AiAction>> = {
  keywords: "keywords",
  threeLines: "three_line_summary",
  summary: "paper_summary",
}
/** The request runner supplies the whole paper as PAPER_CONTEXT for these actions. */
export const PAPER_LEVEL_TARGET = "The whole paper supplied in PAPER_CONTEXT."

/**
 * Overview answers being written, by paper and kind, so the AI 개요 panel joins an answer the
 * background already asked for instead of asking again.
 */
export const overviewRequests = new Map<string, Promise<string>>()

export function overviewRequestKey(documentId: string, kind: DocumentInsightKind): string {
  return `${documentId}:${kind}`
}

/** The whole paper for a paper that is not open, read from its stored AST. */
async function wholePaperOf(document: DocumentRecord, budget: number): Promise<string> {
  const result = await window.ohmypaper.readDocumentAst({
    id: document.id,
    sourceHash: document.hash,
  })
  return result.status === "ready" || result.status === "degraded"
    ? formatWholePaper(pageTextsWithParsedPages(result.ast), budget)
    : ""
}

/**
 * Writes a paper's missing overview answers without the paper being open, so 키워드 사전,
 * 3줄 요약 and 요약 are there by the time it is. `onInsight` gets each answer as it lands.
 */
export async function prefetchPaperOverview(
  document: DocumentRecord,
  missing: readonly DocumentInsightKind[],
  provider: Pick<ProviderStatus, "mode" | "claudeModel">,
  onInsight: (kind: DocumentInsightKind, value: string) => void,
): Promise<void> {
  const wholePaper = await wholePaperOf(document, wholePaperCharacterBudget(provider)).catch(
    () => "",
  )
  await Promise.allSettled(
    missing.map(async (kind) => {
      const key = overviewRequestKey(document.id, kind)
      let request = overviewRequests.get(key)
      if (!request) {
        const started = window.ohmypaper
          .runAi(
            groundedAiRequest(
              document,
              "",
              document.overview,
              {
                action: OVERVIEW_ACTIONS[kind],
                page: 1,
                quote: PAPER_LEVEL_TARGET,
                paperContext: document.overview || document.title,
                before: "",
                after: "",
              },
              wholePaper,
            ),
          )
          .then((result) => result.text)
        request = started
        overviewRequests.set(key, started)
        void started
          .finally(() => {
            if (overviewRequests.get(key) === started) overviewRequests.delete(key)
          })
          .catch(() => undefined)
      }
      const value = (await request).trim()
      if (value) onInsight(kind, value)
    }),
  )
}
