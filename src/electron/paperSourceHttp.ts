import {
  defaultScholarlyTransport,
  type ScholarlyRequestInit,
  type ScholarlyTransport,
  ScholarlyTransportError,
  type ScholarlyTransportResponse,
} from "./scholarlySearchTransport"

export type PaperSourceErrorKind = "rate_limited" | "http_error" | "network" | "malformed"

export class PaperSourceError extends Error {
  readonly name = "PaperSourceError"

  constructor(
    readonly kind: PaperSourceErrorKind,
    readonly httpStatus: number | null = null,
  ) {
    super(`paper_source_${kind}${httpStatus === null ? "" : `_${httpStatus}`}`)
  }
}

export class PaperSearchAbortedError extends Error {
  readonly name = "AbortError"

  constructor() {
    super("aborted")
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PaperSearchAbortedError()
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PaperSearchAbortedError())
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new PaperSearchAbortedError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Spaces request start times per host. `serial` additionally waits for the previous request to
 * finish, which arXiv asks for ("one connection at a time").
 */
export class RequestPacer {
  #nextStart = 0
  #chain: Promise<void> = Promise.resolve()

  constructor(
    readonly minIntervalMs: number,
    readonly serial = false,
  ) {}

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const previous = this.#chain
    this.#chain = gate
    try {
      await previous
      const wait = this.#nextStart - Date.now()
      if (wait > 0) await sleep(wait, signal)
      throwIfAborted(signal)
      this.#nextStart = Date.now() + this.minIntervalMs
      if (!this.serial) release()
      return await task()
    } finally {
      release()
    }
  }
}

/** Shared per-host pacing so concurrent searches never exceed each provider's published limits. */
export const sourcePacers = {
  arxiv: new RequestPacer(3_100, true),
  openalex: new RequestPacer(1_100),
  semanticscholar: new RequestPacer(1_100),
} as const

export type SourceRequest = {
  readonly url: URL
  readonly pacer: RequestPacer
  readonly signal?: AbortSignal | undefined
  readonly init?: ScholarlyRequestInit | undefined
  readonly retries?: number
  readonly transport?: ScholarlyTransport | undefined
}

const maxRetryDelayMs = 6_000

function retryDelayMs(response: ScholarlyTransportResponse, attempt: number): number {
  const hinted = response.retryAfterSeconds === null ? null : response.retryAfterSeconds * 1_000
  return Math.min(hinted ?? 1_500 * (attempt + 1), maxRetryDelayMs)
}

/** Fetches one provider URL with pacing and a small bounded retry on 429/503. */
export async function requestSource(request: SourceRequest): Promise<string> {
  const transport = request.transport ?? defaultScholarlyTransport
  const retries = request.retries ?? 1
  for (let attempt = 0; ; attempt += 1) {
    let response: ScholarlyTransportResponse
    try {
      response = await request.pacer.run(
        () => transport(request.url, request.signal, request.init),
        request.signal,
      )
    } catch (error) {
      if (error instanceof ScholarlyTransportError) {
        if (error.kind === "cancelled") throw new PaperSearchAbortedError()
        throw new PaperSourceError("network")
      }
      throw error
    }
    if (response.statusCode >= 200 && response.statusCode < 300) return response.body
    const retryable = response.statusCode === 429 || response.statusCode === 503
    if (!retryable || attempt >= retries) {
      throw new PaperSourceError(
        response.statusCode === 429 ? "rate_limited" : "http_error",
        response.statusCode,
      )
    }
    await sleep(retryDelayMs(response, attempt), request.signal)
  }
}

export function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) throw new PaperSourceError("malformed")
    throw error
  }
}

export function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}
