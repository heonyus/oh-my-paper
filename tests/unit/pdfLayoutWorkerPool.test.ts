import { describe, expect, it } from "vitest"
import { PdfLayoutWorkerPool } from "../../src/renderer/lib/pdfLayoutWorkerPool"
import type { LayoutRequest } from "../../src/renderer/lib/pdfLayoutWorkerProtocol"

class FakeWorker {
  readonly requests: LayoutRequest[] = []
  #listener: ((event: MessageEvent<unknown>) => void) | null = null

  postMessage(message: LayoutRequest): void {
    this.requests.push(message)
    queueMicrotask(() => {
      this.#listener?.(
        new MessageEvent("message", { data: { id: message.id, ok: true, features: [] } }),
      )
    })
  }

  addEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.#listener = listener
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    if (this.#listener === listener) this.#listener = null
  }

  terminate(): void {
    this.#listener = null
  }
}

describe("PdfLayoutWorkerPool", () => {
  it("distributes independent page analyses across workers", async () => {
    const workers = [new FakeWorker(), new FakeWorker()]
    let nextWorker = 0
    const pool = new PdfLayoutWorkerPool(2, () => {
      const worker = workers[nextWorker]
      nextWorker += 1
      return worker ?? new FakeWorker()
    })
    const input = {
      pageNumber: 1,
      pageWidth: 600,
      pageHeight: 800,
      spans: [],
    }

    await Promise.all([
      pool.analyze(input),
      pool.analyze({ ...input, pageNumber: 2 }),
      pool.analyze({ ...input, pageNumber: 3 }),
      pool.analyze({ ...input, pageNumber: 4 }),
    ])

    expect(
      workers.map((worker) => worker.requests.map((request) => request.input.pageNumber)),
    ).toEqual([
      [1, 3],
      [2, 4],
    ])
    pool.dispose()
  })
})
