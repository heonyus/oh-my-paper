import {
  type AgentAskRequest,
  type AgentAskResult,
  type AgentStep,
  agentAskRequestSchema,
  agentStreamEventSchema,
} from "../shared/agentChat"
import { readSseData, splitSseFrames } from "./sseFrames"

const streamEndpoint = "/api/rpc/agentAskStream"
const requestTimeoutMs = 300_000
const maxBufferChars = 256_000

export class LocalAgentStreamError extends Error {
  readonly name = "LocalAgentStreamError"

  constructor(
    readonly kind: "aborted" | "request_failed" | "invalid_stream" | "server_error",
    readonly status: number | null = null,
    readonly detail: string | null = null,
  ) {
    super(detail ?? kind)
  }
}

function errorMessage(error: unknown): LocalAgentStreamError {
  if (error instanceof LocalAgentStreamError) return error
  const detail = error instanceof Error ? error.message : String(error)
  return new LocalAgentStreamError("invalid_stream", null, detail)
}

export async function agentAskStream(
  request: AgentAskRequest,
  onStep: (step: AgentStep) => void,
  signal?: AbortSignal,
): Promise<AgentAskResult> {
  const parsed = agentAskRequestSchema.parse(request)
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  let response: Response
  try {
    response = await fetch(streamEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(parsed),
      signal: requestSignal,
    })
  } catch (error) {
    if (requestSignal.aborted) throw new LocalAgentStreamError("aborted", null, String(error))
    throw new LocalAgentStreamError("request_failed", null, String(error))
  }
  if (!response.ok) {
    throw new LocalAgentStreamError("request_failed", response.status, response.statusText)
  }
  if (!response.body) throw new LocalAgentStreamError("invalid_stream")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: AgentAskResult | null = null
  const consume = (frame: string): void => {
    const data = readSseData(frame)
    if (data === null) return
    const event = agentStreamEventSchema.parse(JSON.parse(data))
    switch (event.type) {
      case "step":
        onStep(event.step)
        return
      case "result":
        result = event.result
        return
      case "error":
        throw new LocalAgentStreamError("server_error", null, event.error)
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      if (buffer.length > maxBufferChars) throw new LocalAgentStreamError("invalid_stream")
      const split = splitSseFrames(buffer)
      buffer = split.rest
      for (const frame of split.frames) consume(frame)
      if (done) break
    }
    const finalBuffer = decoder.decode()
    if (finalBuffer.length > 0) buffer += finalBuffer
    if (buffer.trim().length > 0) consume(buffer)
    if (result === null) throw new LocalAgentStreamError("invalid_stream", null, "missing_result")
    return result
  } catch (error) {
    if (requestSignal.aborted) throw new LocalAgentStreamError("aborted", null, String(error))
    throw errorMessage(error)
  } finally {
    reader.releaseLock()
  }
}
