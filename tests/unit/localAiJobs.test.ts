import { describe, expect, it } from "vitest"
import type { AiJobStartRequest } from "../../src/shared/aiIpc"
import type { AiJobEvent } from "../../src/shared/documentAiJobs"
import { aiJobEventSchema, createAiJobId } from "../../src/shared/documentAiJobs"
import { documentIdSchema } from "../../src/shared/schemas"
import { createLocalAiJobs } from "../../src/web/localAiJobs"

const requestFixture: AiJobStartRequest = {
  jobId: createAiJobId("job:test-stream"),
  role: "reader",
  documentId: documentIdSchema.parse("2a7bc4b7d15f3640"),
  sourceGeneration: 1,
  parents: [],
  priority: "current",
  pool: "remote_text",
  request: {
    action: "chat",
    documentId: documentIdSchema.parse("2a7bc4b7d15f3640"),
    page: 1,
    quote: "Method A 42 vs Method B 30",
    before: "",
    after: "",
  },
}

type FetchListener = (init: RequestInit) => Promise<Response>

function stubRpcFetch(pathname: string, handler: FetchListener): () => void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (new URL(url, "http://127.0.0.1").pathname === pathname) return handler(init ?? {})
    return originalFetch(input, init)
  }) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

function sseResponse(frames: readonly unknown[]): Response {
  const body = frames
    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    .concat("data: [DONE]\n\n")
    .join("")
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
}

describe("local AI job bridge", () => {
  it("reports an interrupted stream instead of leaving the job running", async () => {
    const jobs = createLocalAiJobs()
    const terminal = new Promise<AiJobEvent>((resolve) => jobs.onAiJobEvent(resolve))
    const restore = stubRpcFetch("/api/rpc/startAiJob", async () => new Response(""))
    try {
      await jobs.startAiJob(requestFixture)
      expect(await terminal).toMatchObject({ kind: "failed", code: "provider_error" })
    } finally {
      restore()
    }
  }, 1000)

  it("reports fetch rejection as a terminal failure", async () => {
    const jobs = createLocalAiJobs()
    const terminal = new Promise<AiJobEvent>((resolve) => jobs.onAiJobEvent(resolve))
    const restore = stubRpcFetch("/api/rpc/startAiJob", async () => {
      throw new TypeError("network unavailable")
    })
    try {
      await jobs.startAiJob(requestFixture)
      expect(await terminal).toMatchObject({ kind: "failed", code: "provider_error" })
    } finally {
      restore()
    }
  }, 1000)

  it("emits provider deltas and settles completed when the stream responds", async () => {
    const jobs = createLocalAiJobs()
    const events: AiJobEvent[] = []
    const unsubscribe = jobs.onAiJobEvent((event) => {
      events.push(aiJobEventSchema.parse(event))
    })
    const restoreFetch = stubRpcFetch("/api/rpc/startAiJob", () =>
      Promise.resolve(
        sseResponse([
          { kind: "started", jobId: "job:test-stream", sequence: 0 },
          {
            kind: "delta",
            jobId: "job:test-stream",
            sequence: 1,
            contentLength: 7,
            delta: "Method ",
          },
          { kind: "delta", jobId: "job:test-stream", sequence: 2, contentLength: 1, delta: "A" },
          {
            kind: "completed",
            jobId: "job:test-stream",
            sequence: 3,
            usageTokens: 7,
            model: "openrouter/z-ai",
            text: "Method A",
          },
        ]),
      ),
    )
    try {
      const start = await jobs.startAiJob(requestFixture)
      expect(start).toEqual({ jobId: "job:test-stream" })
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      restoreFetch()
      unsubscribe()
    }
    expect(events.map((event) => event.kind)).toEqual(["started", "delta", "delta", "completed"])
    const delta = events.find((event) => event.kind === "delta")
    expect(delta).toMatchObject({ delta: "Method " })
    const completed = events.find((event) => event.kind === "completed")
    expect(completed).toMatchObject({ text: "Method A", model: "openrouter/z-ai", usageTokens: 7 })
  })

  it("settles cancelled without provider completion when cancel is requested", async () => {
    const jobs = createLocalAiJobs()
    const events: AiJobEvent[] = []
    const unsubscribe = jobs.onAiJobEvent((event) => {
      events.push(aiJobEventSchema.parse(event))
    })
    const restoreFetch = stubRpcFetch("/api/rpc/startAiJob", () => new Promise<Response>(() => {}))
    try {
      const start = await jobs.startAiJob(requestFixture)
      expect(start).toEqual({ jobId: "job:test-stream" })
      await jobs.cancelAiJob(requestFixture.jobId)
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      restoreFetch()
      unsubscribe()
    }
    const cancelled = events.find((event) => event.kind === "cancelled")
    expect(cancelled).toMatchObject({ jobId: "job:test-stream" })
    const terminal = events.filter((event) => event.kind !== "cancelled")
    expect(terminal).toEqual([])
  })

  it("settles failed with a code when the HTTP response is an error", async () => {
    const jobs = createLocalAiJobs()
    const events: AiJobEvent[] = []
    const unsubscribe = jobs.onAiJobEvent((event) => {
      events.push(aiJobEventSchema.parse(event))
    })
    const restoreFetch = stubRpcFetch("/api/rpc/startAiJob", () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "AI provider is not configured on server" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    )
    try {
      jobs.startAiJob(requestFixture)
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally {
      restoreFetch()
      unsubscribe()
    }
    const failed = events.find((event) => event.kind === "failed")
    expect(failed).toMatchObject({
      jobId: "job:test-stream",
      code: "provider_error",
      retryable: false,
    })
  })
})
