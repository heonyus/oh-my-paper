import { describe, expect, it } from "vitest"
import { AiJobRegistry, publicAiJobEvent } from "../../src/electron/aiJobRegistry"
import { ProviderConfigurationError } from "../../src/electron/providerConfigStore"
import { createAiJobId } from "../../src/shared/documentAiJobs"

describe("AiJobRegistry", () => {
  it("includes complete text in the parsed terminal event", () => {
    const event = publicAiJobEvent({
      kind: "completed",
      jobId: createAiJobId("job:completed"),
      sequence: 2,
      result: {
        text: "complete answer",
        model: "fake/model",
        inputTokens: 2,
        outputTokens: 3,
        estimatedCostUsd: 0,
      },
    })

    expect(event).toMatchObject({ kind: "completed", text: "complete answer", usageTokens: 5 })
  })

  it("propagates abort and ignores late stream deltas", async () => {
    // Given
    const events: string[] = []
    let lateDelta: ((value: string) => void) | undefined
    const registry = new AiJobRegistry((event) => {
      if (event.kind === "delta") events.push(event.delta)
      if (event.kind === "cancelled") events.push(event.kind)
    })
    const handle = registry.start({
      id: createAiJobId("job:stream"),
      role: "reader",
      run: async (signal, onDelta) => {
        lateDelta = onDelta
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        )
        return {
          text: "partial",
          model: "fake/model",
          inputTokens: 2,
          outputTokens: 1,
          estimatedCostUsd: 0,
        }
      },
    })

    // When
    registry.cancel(handle.id)
    lateDelta?.("late")

    // Then
    expect((await handle.result).status).toBe("cancelled")
    expect(events).toEqual(["cancelled"])
    registry.dispose()
  })

  it("preserves unknown usage instead of manufacturing a token count", () => {
    const event = publicAiJobEvent({
      kind: "completed",
      jobId: createAiJobId("job:unknown-usage"),
      sequence: 1,
      result: {
        text: "complete answer",
        model: "fake/model",
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      },
    })

    expect(event).toMatchObject({ kind: "completed", usageTokens: null })
  })

  it("maps typed, status, and synchronous failures without retryable provider errors", async () => {
    const events: string[] = []
    const registry = new AiJobRegistry((event) => {
      if (event.kind === "failed") events.push(event.code)
    })
    const auth = registry.start({
      id: createAiJobId("job:auth"),
      role: "reader",
      run: () => {
        throw new ProviderConfigurationError("auth")
      },
    })
    const rateLimited = registry.start({
      id: createAiJobId("job:rate"),
      role: "reader",
      run: async () => {
        const error = new Error("too many requests")
        Object.defineProperty(error, "status", { value: 429 })
        throw error
      },
    })

    expect(await auth.result).toEqual({ status: "failed", code: "auth" })
    expect(await rateLimited.result).toEqual({ status: "failed", code: "rate_limited" })
    expect(events).toEqual(["auth", "rate_limited"])
    registry.dispose()
  })
})
