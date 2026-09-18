import { describe, expect, it, vi } from "vitest"
import { DocumentJobScheduler } from "../../src/electron/documentJobScheduler"
import { createAiJobId } from "../../src/shared/documentAiJobs"
import { documentIdSchema } from "../../src/shared/schemas"

const documentId = documentIdSchema.parse("aabbccddeeff0011")

describe("DocumentJobScheduler", () => {
  it("runs at most the configured remote jobs and honors priority", async () => {
    // Given
    const release: Array<() => void> = []
    const scheduler = new DocumentJobScheduler({ remoteConcurrency: 2, queueCapacity: 110 })
    const started: string[] = []
    const handles = [
      scheduler.submit({
        id: createAiJobId("job:current"),
        documentId,
        sourceGeneration: 1,
        priority: "current",
        pool: "remote_text",
        run: async () => {
          started.push("99")
          await new Promise<void>((resolve) => release.push(resolve))
          return 99
        },
      }),
      ...Array.from({ length: 99 }, (_, index) =>
        scheduler.submit({
          id: createAiJobId(`job:stress-${index}`),
          documentId,
          sourceGeneration: 1,
          priority: "background",
          pool: "remote_text",
          run: async () => {
            started.push(String(index))
            await new Promise<void>((resolve) => release.push(resolve))
            return index
          },
        }),
      ),
    ]

    // When
    await Promise.resolve()

    // Then
    expect(started).toHaveLength(2)
    expect(started).toEqual(["99", "0"])
    expect(scheduler.activeCount("remote_text")).toBe(2)
    for (const resolve of release.splice(0)) resolve()
    for (const handle of handles) handle.cancel()
    scheduler.dispose()
  })

  it.each([
    ["cancel-before-start", "queued" as const],
    ["cancel-running", "running" as const],
  ])("terminalizes %s exactly once", async (_name, phase) => {
    // Given
    const terminal = vi.fn()
    const scheduler = new DocumentJobScheduler({ remoteConcurrency: 1, onEvent: terminal })
    const first = scheduler.submit({
      id: createAiJobId("job:first"),
      documentId,
      sourceGeneration: 1,
      priority: "current",
      pool: "remote_text",
      run: async () => new Promise<string>(() => undefined),
    })
    const second = scheduler.submit({
      id: createAiJobId(`job:${phase}`),
      documentId,
      sourceGeneration: 1,
      priority: "background",
      pool: "remote_text",
      run: async () => "never-visible",
    })
    if (phase === "queued") second.cancel()
    else {
      await Promise.resolve()
      first.cancel()
      second.cancel()
    }

    // When
    const result = await second.result

    // Then
    expect(result.status).toBe("cancelled")
    expect(
      terminal.mock.calls.filter(
        ([event]) => event.kind === "cancelled" && event.jobId === second.id,
      ),
    ).toHaveLength(1)
    scheduler.dispose()
  })

  it("waits for successful parents and rejects stale generations", async () => {
    // Given
    const scheduler = new DocumentJobScheduler({ remoteConcurrency: 1 })
    const parent = scheduler.submit({
      id: createAiJobId("job:parent"),
      documentId,
      sourceGeneration: 1,
      priority: "prerequisite",
      pool: "local",
      run: async () => "ready",
    })
    const child = scheduler.submit({
      id: createAiJobId("job:child"),
      documentId,
      sourceGeneration: 1,
      parents: [parent.id],
      priority: "background",
      pool: "remote_text",
      run: async () => "child",
    })
    const stale = scheduler.submit({
      id: createAiJobId("job:stale"),
      documentId,
      sourceGeneration: 1,
      priority: "background",
      pool: "remote_text",
      run: async () => "must-not-start",
    })

    // When
    scheduler.setDocumentGeneration(documentId, 2)
    await parent.result

    // Then
    expect((await child.result).status).toBe("cancelled")
    expect((await stale.result).status).toBe("cancelled")
    scheduler.dispose()
  })

  it("times out and disposes without duplicating terminal events", async () => {
    // Given
    vi.useFakeTimers()
    const scheduler = new DocumentJobScheduler({ onEvent: vi.fn() })
    const handle = scheduler.submit({
      id: createAiJobId("job:timeout"),
      documentId,
      sourceGeneration: 1,
      priority: "current",
      pool: "remote_text",
      timeoutMs: 20,
      run: async () => new Promise<string>(() => undefined),
    })

    // When
    await vi.advanceTimersByTimeAsync(20)

    // Then
    expect((await handle.result).status).toBe("failed")
    scheduler.dispose()
    vi.useRealTimers()
  })

  it("rejects beyond the queue cap and does not count cancelled queue entries", async () => {
    // Given
    const scheduler = new DocumentJobScheduler({ remoteConcurrency: 1, queueCapacity: 1 })
    const first = scheduler.submit({
      id: createAiJobId("job:cap-first"),
      documentId,
      sourceGeneration: 1,
      priority: "current",
      pool: "remote_text",
      run: async () => new Promise<void>(() => undefined),
    })
    const queued = scheduler.submit({
      id: createAiJobId("job:cap-queued"),
      documentId,
      sourceGeneration: 1,
      priority: "background",
      pool: "remote_text",
      run: async () => undefined,
    })
    queued.cancel()

    // When / Then
    expect(() =>
      scheduler.submit({
        id: createAiJobId("job:cap-replacement"),
        documentId,
        sourceGeneration: 1,
        priority: "background",
        pool: "remote_text",
        run: async () => undefined,
      }),
    ).not.toThrow()
    first.cancel()
    scheduler.dispose()
  })
})
