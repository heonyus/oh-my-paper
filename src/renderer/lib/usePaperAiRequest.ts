import { useCallback, useMemo } from "react"
import { AI_CONTEXT_MAX_CHARACTERS, type AiRequest } from "../../shared/ipc"
import type { DocumentInsight } from "../../shared/schemas"
import type { DocumentRecord } from "../types"
import { cachedPaperOverviewContext } from "./pdfSearch"

export function groundedAiRequest(
  document: DocumentRecord,
  summary: string,
  localOverview: string,
  request: Omit<AiRequest, "documentId">,
): AiRequest {
  const paperContext = [
    request.paperContext,
    summary ? `캐시된 논문 요약:\n${summary}` : "",
    localOverview ? `로컬 원문 개요:\n${localOverview}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, AI_CONTEXT_MAX_CHARACTERS)
  return { ...request, documentId: document.id, paperContext }
}

export function usePaperAiRequest(
  document: DocumentRecord | null,
  insights: readonly DocumentInsight[],
): (request: Omit<AiRequest, "documentId">) => Promise<string> {
  const summary = useMemo(
    () => insights.find((insight) => insight.kind === "summary")?.value ?? "",
    [insights],
  )
  return useCallback(
    async (request) => {
      if (!document) throw new Error("active document is missing")
      const result = await window.scourgify.runAi(
        groundedAiRequest(document, summary, cachedPaperOverviewContext(document.id), request),
      )
      return result.text
    },
    [document, summary],
  )
}
