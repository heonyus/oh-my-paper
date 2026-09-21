import {
  type DocumentPageParseProgress,
  type DocumentPageParseRequest,
  type DocumentPageParseResult,
  documentPageParseProgressSchema,
  documentPageParseRequestSchema,
} from "../shared/documentPageModel"
import {
  PAGE_PARSE_STREAM_MAX_BUFFER_CHARS,
  type PageParseStreamEvent,
  pageParseStreamEventSchema,
} from "../shared/pageParseStream"

const streamEndpoint = "/api/rpc/parseDocumentPageStream"
const requestTimeoutMs = 180_000
const errorBodyMaxChars = 1_024

export class LocalPageParserError extends Error {
  readonly name = "LocalPageParserError"

  constructor(
    readonly kind:
      | "aborted"
      | "request_failed"
      | "invalid_stream"
      | "server_error"
      | "missing_result"
      | "buffer_exceeded",
    readonly status: number | null = null,
    readonly detail: string | null = null,
  ) {
    super(detail ?? kind)
  }
}

type ProgressListener = (progress: DocumentPageParseProgress) => void

export type LocalPageParserOptions = {
  readonly fetch?: typeof fetch
  readonly endpoint?: string
}

export type LocalPageParser = {
  readonly parse: (
    request: DocumentPageParseRequest,
    signal?: AbortSignal,
  ) => Promise<DocumentPageParseResult>
  readonly onProgress: (listener: ProgressListener) => () => void
}

function assertNever(value: never): never {
  throw new LocalPageParserError("invalid_stream", null, JSON.stringify(value))
}

function readData(frame: string): string | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
  return data.length > 0 ? data : null
}

function splitFrames(buffer: string): {
  readonly frames: readonly string[]
  readonly rest: string
} {
  const frames: string[] = []
  let remainder = buffer
  for (;;) {
    const lineBreak = remainder.indexOf("\n\n")
    const carriageBreak = remainder.indexOf("\r\n\r\n")
    const index =
      lineBreak < 0
        ? carriageBreak
        : carriageBreak < 0
          ? lineBreak
          : Math.min(lineBreak, carriageBreak)
    if (index < 0) return { frames, rest: remainder }
    const separatorLength = index === carriageBreak ? 4 : 2
    frames.push(remainder.slice(0, index))
    remainder = remainder.slice(index + separatorLength)
  }
}

async function readErrorBody(response: Response): Promise<string> {
  if (!response.body) return "request_failed"
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return text.trim() || "request_failed"
      text = (text + decoder.decode(value, { stream: true })).slice(0, errorBodyMaxChars)
    }
  } finally {
    reader.releaseLock()
  }
}

export function createLocalPageParser(options: LocalPageParserOptions = {}): LocalPageParser {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  const endpoint = options.endpoint ?? streamEndpoint
  const listeners = new Set<ProgressListener>()

  const parse = async (
    input: DocumentPageParseRequest,
    signal?: AbortSignal,
  ): Promise<DocumentPageParseResult> => {
    const request = documentPageParseRequestSchema.parse(input)
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs)
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    let response: Response
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(request),
        signal: requestSignal,
      })
    } catch (error) {
      if (requestSignal.aborted) throw new LocalPageParserError("aborted", null, String(error))
      throw new LocalPageParserError("request_failed", null, String(error))
    }
    if (!response.ok) {
      throw new LocalPageParserError(
        "request_failed",
        response.status,
        await readErrorBody(response),
      )
    }
    if (!response.body) throw new LocalPageParserError("invalid_stream")
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let result: DocumentPageParseResult | null = null
    const receive = (event: PageParseStreamEvent): void => {
      switch (event.type) {
        case "progress": {
          const progress = documentPageParseProgressSchema.parse(event.progress)
          if (progress.id !== request.id || progress.pageNumber !== request.pageNumber) {
            throw new LocalPageParserError("invalid_stream", null, "progress_mismatch")
          }
          for (const listener of listeners) listener(progress)
          return
        }
        case "result":
          result = event.result
          return
        case "error":
          throw new LocalPageParserError("server_error", null, event.error)
        default:
          assertNever(event)
      }
    }
    const consume = (frame: string): void => {
      const data = readData(frame)
      if (data === null) return
      receive(pageParseStreamEventSchema.parse(JSON.parse(data)))
    }
    try {
      for (;;) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        if (buffer.length > PAGE_PARSE_STREAM_MAX_BUFFER_CHARS) {
          throw new LocalPageParserError("buffer_exceeded")
        }
        const split = splitFrames(buffer)
        buffer = split.rest
        for (const frame of split.frames) consume(frame)
        if (done) break
      }
      const finalBuffer = decoder.decode()
      if (finalBuffer.length > 0) buffer += finalBuffer
      if (buffer.trim().length > 0) consume(buffer)
      if (result === null) throw new LocalPageParserError("missing_result")
      return result
    } catch (error) {
      if (error instanceof LocalPageParserError) throw error
      if (requestSignal.aborted) throw new LocalPageParserError("aborted", null, String(error))
      if (error instanceof SyntaxError || error instanceof Error) {
        throw new LocalPageParserError("invalid_stream", null, error.message)
      }
      throw error
    } finally {
      reader.releaseLock()
    }
  }

  return {
    parse,
    onProgress: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
