import type { DetectPdfFeaturesInput, PdfFeature } from "./pdfFeatureDetection"
import { type LayoutRequest, layoutResponseSchema } from "./pdfLayoutWorkerProtocol"

type Pending = {
  readonly resolve: (features: readonly PdfFeature[]) => void
  readonly reject: (error: Error) => void
}

type WorkerPort = {
  postMessage(message: LayoutRequest): void
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void
  terminate(): void
}

class LayoutWorkerClient {
  readonly #pending = new Map<number, Pending>()
  readonly #worker: WorkerPort
  readonly #handleMessage = (event: MessageEvent<unknown>): void => {
    const parsed = layoutResponseSchema.safeParse(event.data)
    if (!parsed.success) return
    const pending = this.#pending.get(parsed.data.id)
    if (!pending) return
    this.#pending.delete(parsed.data.id)
    if (parsed.data.ok) pending.resolve(parsed.data.features)
    else pending.reject(new Error(parsed.data.error))
  }

  constructor(worker: WorkerPort) {
    this.#worker = worker
    worker.addEventListener("message", this.#handleMessage)
  }

  analyze(request: LayoutRequest): Promise<readonly PdfFeature[]> {
    return new Promise((resolve, reject) => {
      this.#pending.set(request.id, { resolve, reject })
      this.#worker.postMessage(request)
    })
  }

  dispose(): void {
    this.#worker.removeEventListener("message", this.#handleMessage)
    this.#worker.terminate()
    for (const pending of this.#pending.values())
      pending.reject(new Error("Layout worker disposed"))
    this.#pending.clear()
  }
}

function defaultWorkerCount(): number {
  const available = navigator.hardwareConcurrency || 4
  return Math.max(1, Math.min(4, available - 1))
}

function createWorker(): WorkerPort {
  return new Worker(new URL("../workers/pdfLayout.worker.ts", import.meta.url), { type: "module" })
}

export class PdfLayoutWorkerPool {
  readonly #clients: readonly LayoutWorkerClient[]
  #nextClient = 0
  #nextRequest = 0

  constructor(workerCount = defaultWorkerCount(), factory: () => WorkerPort = createWorker) {
    this.#clients = Array.from(
      { length: Math.max(1, workerCount) },
      () => new LayoutWorkerClient(factory()),
    )
  }

  analyze(input: DetectPdfFeaturesInput): Promise<readonly PdfFeature[]> {
    const client = this.#clients[this.#nextClient % this.#clients.length]
    this.#nextClient += 1
    if (!client) return Promise.reject(new Error("No PDF layout worker available"))
    const spans = input.spans.map((span) => {
      const { rotation, ...required } = span
      return rotation === undefined ? required : { ...required, rotation }
    })
    return client.analyze({ id: this.#nextRequest++, input: { ...input, spans } })
  }

  dispose(): void {
    for (const client of this.#clients) client.dispose()
  }
}
