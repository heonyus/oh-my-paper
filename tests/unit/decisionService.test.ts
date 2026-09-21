import { describe, expect, it } from "vitest"
import {
  type JevDecisionError,
  JevDecisionService,
  type JevHttpRequest,
  type JevHttpTransport,
} from "../../src/server/decisionService"
import { jevDecisionRequestSchema } from "../../src/shared/aiDecision"

const request = jevDecisionRequestSchema.parse({
  task: "relevance",
  text: "A paper about attention mechanisms.",
  candidates: [
    { id: "paper-a", text: "Attention Is All You Need" },
    { id: "paper-b", text: "A paper about compiler construction" },
  ],
})

function responseBody(value: unknown): AsyncIterable<Uint8Array> {
  return (async function* () {
    yield new TextEncoder().encode(JSON.stringify(value))
  })()
}

function successfulResponse(choice: string, probability = 0.88): unknown {
  return {
    model: "typesafe/jev-1.13-20260917",
    provider: "TypeSafe",
    answers: {
      choice: {
        type: "choice",
        choice,
        probabilities: { [choice]: probability },
        confidence: probability,
      },
    },
  }
}

describe("JevDecisionService", () => {
  it("returns the validated selected candidate and its model probability", async () => {
    // Given
    const received: { value: JevHttpRequest | null } = { value: null }
    const transport: JevHttpTransport = async (input) => {
      received.value = input
      return { statusCode: 200, body: responseBody(successfulResponse("paper-a")) }
    }
    const service = new JevDecisionService("test-openrouter-key", { transport })

    // When
    const result = await service.decide(request)

    // Then
    expect(result).toMatchObject({
      task: "relevance",
      choiceId: "paper-a",
      probability: 0.88,
      model: "typesafe/jev-1.13-20260917",
      provider: "TypeSafe",
    })
    expect(received.value?.url.toString()).toBe("https://openrouter.ai/api/alpha/decisions")
    expect(received.value?.headers).toMatchObject({ authorization: "Bearer test-openrouter-key" })
    expect(JSON.parse(received.value?.body ?? "{}")).toMatchObject({
      model: "typesafe/jev-1.13",
      state: { text: request.text },
    })
  })

  it("rejects a model choice that was not supplied by the caller", async () => {
    // Given
    const transport: JevHttpTransport = async () => ({
      statusCode: 200,
      body: responseBody(successfulResponse("not-a-candidate")),
    })

    // When
    const operation = new JevDecisionService("test-key", { transport }).decide(request)

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "JevDecisionError",
      kind: "invalid_response",
    } satisfies Partial<JevDecisionError>)
  })

  it("rejects a malformed provider response", async () => {
    // Given
    const transport: JevHttpTransport = async () => ({
      statusCode: 200,
      body: responseBody({ model: "typesafe/jev-1.13-20260917", answers: {} }),
    })

    // When
    const operation = new JevDecisionService("test-key", { transport }).decide(request)

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "JevDecisionError",
      kind: "invalid_response",
    } satisfies Partial<JevDecisionError>)
  })

  it("rejects a request whose combined candidate text exceeds the input bound", async () => {
    // Given
    const oversized = {
      task: "highlight",
      text: "x".repeat(20_000),
      candidates: Array.from({ length: 8 }, (_, index) => ({
        id: `candidate-${index}`,
        text: "y".repeat(8_000),
      })),
    }

    // When
    const operation = new JevDecisionService("test-key", {
      transport: async () => {
        throw new Error("transport must not be called")
      },
    }).decide(oversized)

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "JevDecisionError",
      kind: "invalid_request",
    } satisfies Partial<JevDecisionError>)
  })

  it("propagates caller cancellation as a typed cancelled error", async () => {
    // Given
    const controller = new AbortController()
    const observedSignal: { value: AbortSignal | null } = { value: null }
    let resolveStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    const transport: JevHttpTransport = ({ signal }) => {
      observedSignal.value = signal
      resolveStarted()
      return new Promise((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    }
    const operation = new JevDecisionService("test-key", { transport }).decide(
      request,
      controller.signal,
    )

    // When
    await started
    controller.abort()

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "JevDecisionError",
      kind: "cancelled",
    } satisfies Partial<JevDecisionError>)
    expect(observedSignal.value?.aborted).toBe(true)
  })
})
