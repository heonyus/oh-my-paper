import {
  type ScholarlySearchRequest,
  type ScholarlySearchResult,
  type ScholarlySearchStep,
  scholarlySearchRequestSchema,
  scholarlySearchStreamEventSchema,
} from "../shared/scholarlySearchSchemas"
import { readSseData, splitSseFrames } from "./sseFrames"

const streamEndpoint = "/api/rpc/scholarlySearchStream"
/** Three providers, two at a time, each bounded by its own transport timeout. */
const requestTimeoutMs = 120_000
const maxBufferChars = 1_024_000

export class ScholarlySearchStreamError extends Error {
  readonly name = "ScholarlySearchStreamError"

  constructor(
    readonly kind: "aborted" | "request_failed" | "invalid_stream" | "server_error",
    readonly status: number | null = null,
    readonly detail: string | null = null,
  ) {
    super(detail ?? kind)
  }
}

function asStreamError(error: unknown): ScholarlySearchStreamError {
  if (error instanceof ScholarlySearchStreamError) return error
  const detail = error instanceof Error ? error.message : String(error)
  return new ScholarlySearchStreamError("invalid_stream", null, detail)
}

/** Runs a related-paper search and reports each provider step as the server reaches it. */
export async function scholarlySearchStream(
  request: ScholarlySearchRequest,
  onStep: (step: ScholarlySearchStep) => void,
  signal?: AbortSignal,
): Promise<ScholarlySearchResult> {
  const parsed = scholarlySearchRequestSchema.parse(request)
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
    if (requestSignal.aborted) throw new ScholarlySearchStreamError("aborted", null, String(error))
    throw new ScholarlySearchStreamError("request_failed", null, String(error))
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body: unknown = await response.json()
      if (typeof body === "object" && body !== null && "error" in body) {
        const value = body.error
        if (typeof value === "string" && value.length > 0) detail = value
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw asStreamError(error)
    }
    throw new ScholarlySearchStreamError("request_failed", response.status, detail)
  }
  if (!response.body) throw new ScholarlySearchStreamError("invalid_stream")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: ScholarlySearchResult | null = null
  const consume = (frame: string): void => {
    const data = readSseData(frame)
    if (data === null) return
    const event = scholarlySearchStreamEventSchema.parse(JSON.parse(data))
    switch (event.type) {
      case "step":
        onStep(event.step)
        return
      case "result":
        result = event.result
        return
      case "error":
        throw new ScholarlySearchStreamError("server_error", null, event.error)
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      if (buffer.length > maxBufferChars) throw new ScholarlySearchStreamError("invalid_stream")
      const split = splitSseFrames(buffer)
      buffer = split.rest
      for (const frame of split.frames) consume(frame)
      if (done) break
    }
    const finalBuffer = decoder.decode()
    if (finalBuffer.length > 0) buffer += finalBuffer
    if (buffer.trim().length > 0) consume(buffer)
    if (result === null)
      throw new ScholarlySearchStreamError("invalid_stream", null, "missing_result")
    return result
  } catch (error) {
    if (requestSignal.aborted) throw new ScholarlySearchStreamError("aborted", null, String(error))
    throw asStreamError(error)
  } finally {
    reader.releaseLock()
  }
}
