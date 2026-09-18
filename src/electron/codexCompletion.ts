import type {
  CodexAgentMessageDeltaNotification,
  CodexTurnCompletedNotification,
} from "../shared/codexProtocol"
import type { CodexAppServerClient } from "./codexAppServerClient"
import { CodexCompletionError } from "./codexClientDispatch"
import { sanitizeErrorMessage } from "./codexEnvironment"
import type { CodexSession } from "./codexSession"

export type CodexCompletionOptions = {
  readonly prompt: string
  readonly imageDataUrl?: string | undefined
  readonly model?: string | undefined
  readonly reasoningEffort?: string | undefined
  readonly onDelta?: ((delta: string) => void) | undefined
  readonly signal?: AbortSignal | undefined
  readonly timeoutMs?: number | undefined
}

const MAX_OUTPUT_CHARS = 2 * 1024 * 1024

function ignoreInterruptFailure(error: unknown): void {
  if (error instanceof Error) return
}

export async function runCodexCompletion(
  session: CodexSession,
  client: CodexAppServerClient,
  params: CodexCompletionOptions,
): Promise<string> {
  if (params.signal?.aborted) {
    throw new CodexCompletionError("aborted", "Completion aborted")
  }

  let threadId: string
  try {
    threadId = await session.startThread({ signal: params.signal })
  } catch (error) {
    if (params.signal?.aborted) {
      throw new CodexCompletionError("aborted", "Completion aborted")
    }
    throw error
  }

  let teardown = (): void => {}
  const completion = new Promise<string>((resolve, reject) => {
    let settled = false
    let turnId: string | null = null
    let stopRequested = false
    let output = ""
    const timeoutMs = params.timeoutMs ?? 120_000
    const timer = setTimeout(() => {
      requestStop(new CodexCompletionError("timeout", `Completion timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const finish = (result: { readonly value?: string; readonly error?: Error }): void => {
      if (settled) return
      settled = true
      teardown()
      if (result.error !== undefined) reject(result.error)
      else resolve(result.value ?? "")
    }

    const interrupt = (): void => {
      if (turnId === null) return
      void session.interruptTurn({ threadId, turnId }).catch(ignoreInterruptFailure)
    }

    function requestStop(error: CodexCompletionError): void {
      stopRequested = true
      interrupt()
      finish({ error })
    }

    const onAbort = (): void => {
      requestStop(new CodexCompletionError("aborted", "Completion aborted"))
    }
    const onDelta = (notification: CodexAgentMessageDeltaNotification): void => {
      if (!matchesTurn(notification.threadId, notification.turnId)) return
      if (output.length + notification.delta.length > MAX_OUTPUT_CHARS) {
        requestStop(new CodexCompletionError("output_limit", "Completion output exceeded limit"))
        return
      }
      output += notification.delta
      params.onDelta?.(notification.delta)
    }
    const onCompleted = (notification: CodexTurnCompletedNotification): void => {
      if (!matchesTurn(notification.threadId, notification.turn.id)) return
      if (notification.turn.status === "inProgress") return
      if (notification.turn.status === "failed" || notification.turn.error) {
        requestStop(
          new CodexCompletionError(
            "failed",
            sanitizeErrorMessage(notification.turn.error?.message ?? "Turn failed"),
          ),
        )
      } else if (notification.turn.status === "interrupted") {
        requestStop(new CodexCompletionError("interrupted", "Turn interrupted"))
      } else {
        finish({ value: output })
      }
    }
    const onExit = (): void => {
      requestStop(
        new CodexCompletionError("subprocess_exit", "Codex subprocess exited unexpectedly"),
      )
    }

    function matchesTurn(notificationThreadId: string, notificationTurnId: string): boolean {
      if (notificationThreadId !== threadId) return false
      if (turnId === null) turnId = notificationTurnId
      return turnId === notificationTurnId
    }

    const unsubDelta = client.onDelta(onDelta)
    const unsubCompleted = client.onTurnCompleted(onCompleted)
    const unsubExit = client.onExit(onExit)
    teardown = (): void => {
      clearTimeout(timer)
      unsubDelta()
      unsubCompleted()
      unsubExit()
      params.signal?.removeEventListener("abort", onAbort)
    }
    params.signal?.addEventListener("abort", onAbort, { once: true })

    if (params.signal?.aborted) onAbort()

    void session
      .startTurn({
        threadId,
        prompt: params.prompt,
        imageDataUrl: params.imageDataUrl,
        ...(params.model !== undefined ? { model: params.model } : {}),
        ...(params.reasoningEffort !== undefined
          ? { reasoningEffort: params.reasoningEffort }
          : {}),
        signal: params.signal,
      })
      .then((startedTurnId) => {
        turnId = startedTurnId
        if (stopRequested) interrupt()
        if (params.signal?.aborted && !settled) onAbort()
      })
      .catch((error: unknown) => {
        if (settled) return
        requestStop(
          new CodexCompletionError(
            "failed",
            error instanceof Error ? sanitizeErrorMessage(error.message) : "Turn failed",
          ),
        )
      })
  })

  try {
    return await completion
  } finally {
    teardown()
  }
}
