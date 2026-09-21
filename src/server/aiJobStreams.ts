import type { AiJobStartRequest } from "../shared/aiIpc"
import { type AiJobId, aiPolicy } from "../shared/documentAiJobs"
import { createLocalAiJobBroker } from "./aiJobStream"
import type { WebAiService } from "./aiService"

type ActiveStream = {
  readonly controller: ReadableStreamDefaultController<Uint8Array>
  readonly vision: boolean
}

export function createAiJobStreams(ai: Pick<WebAiService, "stream">) {
  const active = new Map<AiJobId, ActiveStream>()
  const encoder = new TextEncoder()
  const encode = (event: unknown) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  const broker = createLocalAiJobBroker(ai, (event) => {
    const stream = active.get(event.jobId)
    if (!stream) return
    stream.controller.enqueue(encode(event))
    switch (event.kind) {
      case "started":
      case "delta":
        return
      case "completed":
      case "failed":
      case "cancelled":
        active.delete(event.jobId)
        stream.controller.close()
        return
    }
  })

  function start(request: AiJobStartRequest): AsyncIterable<Uint8Array> {
    if (active.has(request.jobId)) throw new Error("AI job already running")
    const vision = request.request.imageDataUrl !== undefined
    const poolSize = [...active.values()].filter((stream) => stream.vision === vision).length
    const poolLimit = vision ? aiPolicy.concurrentVisionJobs : aiPolicy.concurrentTextJobs
    const unavailable = active.size >= aiPolicy.concurrentJobs || poolSize >= poolLimit
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (unavailable) {
          controller.enqueue(
            encode({
              kind: "failed",
              jobId: request.jobId,
              sequence: 0,
              code: "queue_full",
              retryable: true,
            }),
          )
          controller.close()
          return
        }
        active.set(request.jobId, { controller, vision })
        void broker.start(request)
      },
      cancel() {
        active.delete(request.jobId)
        void broker.cancel(request.jobId)
      },
    })
    return {
      async *[Symbol.asyncIterator]() {
        const reader = stream.getReader()
        try {
          for (;;) {
            const next = await reader.read()
            if (next.done) return
            yield next.value
          }
        } finally {
          await reader.cancel()
          reader.releaseLock()
        }
      },
    }
  }

  return {
    start,
    cancel: (jobId: AiJobId): void => {
      void broker.cancel(jobId)
    },
    dispose: (): void => broker.dispose(),
  }
}
