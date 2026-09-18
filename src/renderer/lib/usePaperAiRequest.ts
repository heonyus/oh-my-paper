import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  type AiJobErrorCode,
  type AiJobId,
  type AiRole,
  createAiJobId,
} from "../../shared/documentAiJobs"
import { documentKindLabels } from "../../shared/documentKind"
import { AI_CONTEXT_MAX_CHARACTERS, type AiRequest } from "../../shared/ipc"
import type { DocumentInsight } from "../../shared/schemas"
import type { AiDeltaHandler, AiRequestRunner, DocumentRecord } from "../types"
import { cachedPaperOverviewContext } from "./pdfSearch"

export class PaperAiJobError extends Error {
  readonly name = "PaperAiJobError"

  constructor(readonly code: AiJobErrorCode) {
    super(`AI job failed: ${code}`)
  }
}

export function aiRoleForAction(action: AiRequest["action"]): AiRole {
  switch (action) {
    case "translation":
    case "page_translation":
      return "translation"
    case "page_structure":
      return "structure"
    case "citation":
    case "citation_assessment":
    case "citation_chat":
      return "citation"
    default:
      return "reader"
  }
}

export function usesDirectPaperCompletion(
  action: AiRequest["action"],
  hasDeltaHandler: boolean,
): boolean {
  return action === "page_translation" && !hasDeltaHandler
}

export function paperContextModeForAction(action: AiRequest["action"]): "minimal" | "grounded" {
  return action === "page_translation" ? "minimal" : "grounded"
}

export function groundedAiRequest(
  document: DocumentRecord,
  summary: string,
  localOverview: string,
  request: Omit<AiRequest, "documentId">,
): AiRequest {
  const contextLimit =
    request.action === "translation" ||
    request.action === "page_translation" ||
    request.action === "card_title"
      ? 1_800
      : request.action === "figure" || request.action === "table"
        ? 6_000
        : AI_CONTEXT_MAX_CHARACTERS
  const contextParts = [
    `문서 유형: ${documentKindLabels[document.kind]}. 이 유형에 맞는 용어와 분석 기준을 사용하세요.`,
    request.paperContext,
    summary ? `캐시된 논문 요약:\n${summary}` : "",
    localOverview ? `로컬 원문 개요:\n${localOverview}` : "",
  ]
  const paperContext = (
    paperContextModeForAction(request.action) === "minimal"
      ? contextParts.slice(0, 1)
      : contextParts
  )
    .filter(Boolean)
    .join("\n\n")
    .slice(0, contextLimit)
  return { ...request, documentId: document.id, paperContext }
}

function frameEmitter(onDelta: AiDeltaHandler | undefined): {
  readonly push: AiDeltaHandler
  readonly flush: () => void
  readonly cancel: () => void
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
    cancel: () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      buffered = ""
    },
  }
}

export function usePaperAiRequest(
  document: DocumentRecord | null,
  insights: readonly DocumentInsight[],
): AiRequestRunner {
  const activeJobs = useRef(new Set<AiJobId>())
  const sourceGeneration = useRef(0)
  const activeDocumentId = document?.id ?? null
  const summary = useMemo(
    () => insights.find((insight) => insight.kind === "summary")?.value ?? "",
    [insights],
  )
  useEffect(() => {
    if (activeDocumentId) sourceGeneration.current += 1
    return () => {
      for (const jobId of activeJobs.current) void window.scourgify.cancelAiJob(jobId)
      activeJobs.current.clear()
    }
  }, [activeDocumentId])
  return useCallback(
    async (request, onDelta, signal) => {
      if (!document) throw new Error("active document is missing")
      if (signal?.aborted) throw new PaperAiJobError("cancelled")
      const grounded = groundedAiRequest(
        document,
        summary,
        document.overview || cachedPaperOverviewContext(document.id),
        request,
      )
      if (usesDirectPaperCompletion(grounded.action, onDelta !== undefined) && !signal)
        return (await window.scourgify.runAi(grounded)).text
      const emitter = frameEmitter(onDelta)
      const jobId = createAiJobId(`job:${crypto.randomUUID()}`)
      activeJobs.current.add(jobId)
      let started = false
      const abortHandler = (): void => {
        emitter.cancel()
        if (started) void window.scourgify.cancelAiJob(jobId).catch(() => undefined)
      }
      try {
        const result = await new Promise<string>((resolve, reject) => {
          let settled = false
          let unsubscribe = (): void => undefined
          const settle = (finish: () => void): void => {
            if (settled) return
            settled = true
            unsubscribe()
            signal?.removeEventListener("abort", cancel)
            finish()
          }
          const cancel = (): void => {
            settle(() => reject(new PaperAiJobError("cancelled")))
            abortHandler()
          }
          if (signal?.aborted) {
            cancel()
            return
          }
          unsubscribe = window.scourgify.onAiJobEvent((event) => {
            if (event.jobId !== jobId) return
            switch (event.kind) {
              case "started":
                return
              case "delta":
                if (event.delta) emitter.push(event.delta)
                return
              case "completed":
                settle(() => resolve(event.text))
                return
              case "failed":
                settle(() => reject(new PaperAiJobError(event.code)))
                return
              case "cancelled":
                settle(() => reject(new PaperAiJobError("cancelled")))
                return
              default: {
                const exhaustive: never = event
                return exhaustive
              }
            }
          })
          if (signal) signal.addEventListener("abort", cancel, { once: true })
          started = true
          void window.scourgify
            .startAiJob({
              jobId,
              role: aiRoleForAction(grounded.action),
              documentId: document.id,
              sourceGeneration: sourceGeneration.current,
              parents: [],
              priority: "current",
              pool: grounded.imageDataUrl ? "remote_vision" : "remote_text",
              request: grounded,
            })
            .catch((error: unknown) => settle(() => reject(error)))
        })
        emitter.flush()
        return result
      } catch (error) {
        if (signal?.aborted) emitter.cancel()
        else emitter.flush()
        throw error
      } finally {
        activeJobs.current.delete(jobId)
      }
    },
    [document, summary],
  )
}
