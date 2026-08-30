import { useCallback, useMemo } from "react"
import { AI_CONTEXT_MAX_CHARACTERS, type AiRequest } from "../../shared/ipc"
import type { DocumentInsight } from "../../shared/schemas"
import type { AiDeltaHandler, AiRequestRunner, DocumentRecord } from "../types"
import { cachedPaperOverviewContext } from "./pdfSearch"

export function groundedAiRequest(
  document: DocumentRecord,
  summary: string,
  localOverview: string,
  request: Omit<AiRequest, "documentId">,
): AiRequest {
  const contextLimit =
    request.action === "translation" || request.action === "card_title"
      ? 1_800
      : request.action === "figure" || request.action === "table"
        ? 6_000
        : AI_CONTEXT_MAX_CHARACTERS
  const paperContext = [
    request.paperContext,
    summary ? `캐시된 논문 요약:\n${summary}` : "",
    localOverview ? `로컬 원문 개요:\n${localOverview}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, contextLimit)
  return { ...request, documentId: document.id, paperContext }
}

function frameEmitter(onDelta: AiDeltaHandler | undefined): {
  readonly push: AiDeltaHandler
  readonly flush: () => void
} {
  let buffered = ""
  let frame: number | null = null
  const emit = (): void => {
    frame = null
    if (!buffered || !onDelta) return
    const delta = buffered
    buffered = ""
    onDelta(delta)
  }
  return {
    push: (delta) => {
      buffered += delta
      if (frame === null) frame = requestAnimationFrame(emit)
    },
    flush: () => {
      if (frame !== null) cancelAnimationFrame(frame)
      emit()
    },
  }
}

export function usePaperAiRequest(
  document: DocumentRecord | null,
  insights: readonly DocumentInsight[],
): AiRequestRunner {
  const summary = useMemo(
    () => insights.find((insight) => insight.kind === "summary")?.value ?? "",
    [insights],
  )
  return useCallback(
    async (request, onDelta) => {
      if (!document) throw new Error("active document is missing")
      const emitter = frameEmitter(onDelta)
      try {
        const result = await window.scourgify.streamAi(
          groundedAiRequest(document, summary, cachedPaperOverviewContext(document.id), request),
          emitter.push,
        )
        emitter.flush()
        return result.text
      } catch (error) {
        emitter.flush()
        throw error
      }
    },
    [document, summary],
  )
}
