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
  const emit = (event: AiJobEvent): void => {
    for (const listener of listeners) listener(event)
  }

  const startAiJob: StartAiJob = (request) => {
    const jobId = request.jobId
    void (async () => {
      const response = await fetch("/api/rpc/startAiJob", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      })
      const stream = response.body
      if (!response.ok || stream === null) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null
        emit({
          kind: "failed",
          jobId,
          sequence: 0,
          code: "provider_error",
          retryable: false,
        })
        throw new Error(failure?.error ?? "startAiJob request failed")
      }
      await readJobEvents(jobId, stream, emit)
    })().catch(() => undefined)
    return Promise.resolve({ jobId: request.jobId })
  }

  const cancelAiJob: CancelAiJob = async (jobId) => {
    void fetch("/api/rpc/cancelAiJob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    }).catch(() => undefined)
    emit({ kind: "cancelled", jobId, sequence: 0 })
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
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffered += decode.decode(value, { stream: true })
      const frames = buffered.split("\n\n")
      buffered = frames.pop() ?? ""
      for (const frame of frames) {
        const event = parseFrame(jobId, frame)
        if (event) emit(event)
      }
    }
    if (buffered.length > 0) {
      const event = parseFrame(jobId, buffered)
      if (event) emit(event)
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
