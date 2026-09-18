import {
  type CodexRpcNotification,
  type CodexRpcResponse,
  type CodexRpcServerRequest,
  codexRpcErrorResponseSchema,
  codexRpcNotificationSchema,
  codexRpcResponseSchema,
  codexRpcServerRequestSchema,
} from "../shared/codexProtocol"

export type CodexIncomingMessage =
  | { readonly kind: "response"; readonly message: CodexRpcResponse }
  | { readonly kind: "server_request"; readonly request: CodexRpcServerRequest }
  | { readonly kind: "notification"; readonly notification: CodexRpcNotification }

export function parseCodexIncomingMessage(line: string): CodexIncomingMessage | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }

  const response = codexRpcResponseSchema.safeParse(raw)
  if (response.success) return { kind: "response", message: response.data }

  const serverRequest = codexRpcServerRequestSchema.safeParse(raw)
  if (serverRequest.success) return { kind: "server_request", request: serverRequest.data }

  const notification = codexRpcNotificationSchema.safeParse(raw)
  if (notification.success) return { kind: "notification", notification: notification.data }

  const rpcError = codexRpcErrorResponseSchema.safeParse(raw)
  return rpcError.success ? { kind: "response", message: rpcError.data } : null
}
