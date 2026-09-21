import type { AiJobStartRequest } from "../shared/aiIpc"
import type { AiJobEvent, AiJobId } from "../shared/documentAiJobs"
import { aiJobEventSchema } from "../shared/documentAiJobs"

type StartAiJob = (request: AiJobStartRequest) => Promise<{ readonly jobId: AiJobId }>
type CancelAiJob = (jobId: AiJobId) => Promise<void>
type OnAiJobEvent = (listener: (event: AiJobEvent) => void) => () => void

export type LocalAiJobs = {
  readonly startAiJob: StartAiJob
  readonly cancelAiJob: CancelAiJob
  readonly onAiJobEvent: OnAiJobEvent
}

export function createLocalAiJobs(): LocalAiJobs {
  const listeners = new Set<(event: AiJobEvent) => void>()
  const active = new Map<AiJobId, { readonly controller: AbortController; sequence: number }>()
  const emit = (event: AiJobEvent): void => {
    for (const listener of listeners) listener(event)
  }

  const startAiJob: StartAiJob = (request) => {
    const jobId = request.jobId
    if (active.has(jobId)) return Promise.reject(new Error("AI job already running"))
    const job = { controller: new AbortController(), sequence: 0 }
    active.set(jobId, job)
    const receive = (event: AiJobEvent): void => {
      if (active.get(jobId) !== job) return
      job.sequence = event.sequence
      switch (event.kind) {
        case "started":
        case "delta":
          break
        case "completed":
        case "failed":
        case "cancelled":
          active.delete(jobId)
          break
      }
      emit(event)
    }
    void (async () => {
      const response = await fetch("/api/rpc/startAiJob", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: job.controller.signal,
      })
      const stream = response.body
      if (!response.ok || stream === null) {
        await stream?.cancel()
        throw new Error("AI request failed")
      }
      await readJobEvents(jobId, stream, receive)
      if (active.get(jobId) === job) throw new Error("AI stream ended before completion")
    })()
      .catch(() => {
        receive({
          kind: "failed",
          jobId,
          sequence: job.sequence + 1,
          code: "provider_error",
          retryable: false,
        })
      })
      .finally(() => {
        job.controller.abort()
      })
    return Promise.resolve({ jobId: request.jobId })
  }

  const cancelAiJob: CancelAiJob = async (jobId) => {
    const job = active.get(jobId)
    if (!job) return
    active.delete(jobId)
    job.controller.abort()
    void fetch("/api/rpc/cancelAiJob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    }).catch(() => undefined)
    emit({ kind: "cancelled", jobId, sequence: job.sequence + 1 })
  }

  const onAiJobEvent: OnAiJobEvent = (listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { startAiJob, cancelAiJob, onAiJobEvent }
}

function readJobEvents(
  jobId: AiJobId,
  stream: ReadableStream<Uint8Array>,
  emit: (event: AiJobEvent) => void,
): Promise<void> {
  const decode = new TextDecoder()
  const pump = async (): Promise<void> => {
    const reader = stream.getReader()
    let buffered = ""
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffered += decode.decode(value, { stream: true })
        if (buffered.length > 262_144) throw new Error("AI event exceeds limit")
        const frames = buffered.split(/\r?\n\r?\n/u)
        buffered = frames.pop() ?? ""
        for (const frame of frames) {
          const event = parseFrame(jobId, frame)
          if (!event) continue
          emit(event)
          if (event.kind === "completed" || event.kind === "failed" || event.kind === "cancelled")
            return
        }
      }
      if (buffered.length > 0) {
        const event = parseFrame(jobId, buffered)
        if (event) emit(event)
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
  return pump()
}

function parseFrame(jobId: AiJobId, frame: string): AiJobEvent | null {
  if (!frame.startsWith("data: ")) return null
  const payload = frame.slice("data: ".length).trim()
  if (payload === "[DONE]" || payload.length === 0) return null
  const parsed: AiJobEvent = aiJobEventSchema.parse(JSON.parse(payload))
  return parsed.jobId === jobId ? parsed : null
}
