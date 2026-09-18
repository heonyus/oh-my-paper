import {
  type CodexAgentMessageDeltaNotification,
  type CodexLoginCompletedEvent,
  type CodexRpcNotification,
  type CodexRpcResponse,
  type CodexRpcServerRequest,
  type CodexTurnCompletedNotification,
  codexAgentMessageDeltaNotificationSchema,
  codexLoginCompletedEventSchema,
  codexTurnCompletedNotificationSchema,
} from "../shared/codexProtocol"
import {
  CodexAppServerError,
  handleServerRequestAutoDeny,
  type PendingRequest,
} from "./codexClientDispatch"
import { sanitizeErrorMessage } from "./codexEnvironment"

export type CodexEventListeners = {
  readonly loginCompleted: ReadonlySet<(event: CodexLoginCompletedEvent) => void>
  readonly delta: ReadonlySet<(notification: CodexAgentMessageDeltaNotification) => void>
  readonly turnCompleted: ReadonlySet<(notification: CodexTurnCompletedNotification) => void>
  readonly exit: ReadonlySet<(code: number | null) => void>
}

export function handleCodexIncomingMessage(
  message:
    | { readonly kind: "response"; readonly message: CodexRpcResponse }
    | { readonly kind: "server_request"; readonly request: CodexRpcServerRequest }
    | { readonly kind: "notification"; readonly notification: CodexRpcNotification },
  pending: Map<string, PendingRequest>,
  writeLine: (line: string) => void,
  listeners: CodexEventListeners,
): void {
  if (message.kind === "response") {
    const id = message.message.id
    if (id === null) return
    const key = String(id)
    const request = pending.get(key)
    if (!request) return
    pending.delete(key)
    if ("error" in message.message) {
      const error = message.message.error
      request.reject(new CodexAppServerError(sanitizeErrorMessage(error.message), error.code))
    } else {
      request.resolve(message.message.result)
    }
    return
  }
  if (message.kind === "server_request") {
    handleServerRequestAutoDeny(message.request, writeLine)
    return
  }
  handleCodexNotification(message.notification, listeners)
}

function handleCodexNotification(
  notification: CodexRpcNotification,
  listeners: CodexEventListeners,
): void {
  if (notification.method === "account/login/completed") {
    const parsed = codexLoginCompletedEventSchema.safeParse(notification.params)
    if (parsed.success) {
      for (const listener of listeners.loginCompleted) listener(parsed.data)
    }
  } else if (notification.method === "item/agentMessage/delta") {
    const parsed = codexAgentMessageDeltaNotificationSchema.safeParse(notification.params)
    if (parsed.success) {
      for (const listener of listeners.delta) listener(parsed.data)
    }
  } else if (notification.method === "turn/completed") {
    const parsed = codexTurnCompletedNotificationSchema.safeParse(notification.params)
    if (parsed.success) {
      for (const listener of listeners.turnCompleted) listener(parsed.data)
    }
  }
}

export function handleCodexSubprocessError(
  error: Error,
  pending: Map<string, PendingRequest>,
): void {
  for (const [, request] of pending) {
    clearTimeout(request.timer)
    request.reject(new CodexAppServerError(sanitizeErrorMessage(error.message)))
  }
  pending.clear()
}

export function handleCodexSubprocessExit(
  code: number | null,
  pending: Map<string, PendingRequest>,
  listeners: ReadonlySet<(code: number | null) => void>,
): void {
  for (const [, request] of pending) {
    clearTimeout(request.timer)
    request.reject(new CodexAppServerError("Codex subprocess exited unexpectedly"))
  }
  pending.clear()
  for (const listener of listeners) listener(code)
}
