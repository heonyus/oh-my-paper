import { describe, expect, it, vi } from "vitest"
import {
  extractPartialTranslations,
  isRecoverableAiError,
  translatePageBatch,
} from "../../src/renderer/lib/pageTranslationAi"
import { PaperAiJobError } from "../../src/renderer/lib/usePaperAiRequest"

const batch = [
  { id: "p1-b1", kind: "heading", source: "Results" },
  { id: "p1-b2", kind: "body", source: "The score improved." },
] as const

describe("mapped page translation response", () => {
  it("retries one transient provider failure before failing the page", async () => {
    const response = JSON.stringify({
      translations: [
        { id: "b0", markdown: "결과" },
        { id: "b1", markdown: "점수가 향상됐다." },
      ],
    })
    const onAiRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce(response)

    const translated = await translatePageBatch({
      batch,
      page: 1,
      onAiRequest,
      onPartial: vi.fn(),
    })

    expect(onAiRequest).toHaveBeenCalledTimes(2)
    expect([...translated]).toEqual([
      ["p1-b1", "결과"],
      ["p1-b2", "점수가 향상됐다."],
    ])
  })

  it("retries only missing IDs after a truncated response", async () => {
    const first = JSON.stringify({
      translations: [{ id: "b0", markdown: "결과" }],
    })
    const second = JSON.stringify({
      translations: [{ id: "b0", markdown: "점수가 향상됐다." }],
    })
    const requests: string[] = []
    const onAiRequest = vi.fn(async (request, onDelta) => {
      requests.push(request.quote)
      if (requests.length === 1) {
        onDelta?.(first.slice(0, -1))
        throw new Error("provider response truncated")
      }
      return second
    })

    const translated = await translatePageBatch({
      batch,
      page: 1,
      onAiRequest,
      onPartial: vi.fn(),
    })

    expect(requests).toHaveLength(2)
    expect(JSON.parse(requests[1] ?? "{}").blocks).toEqual([
      { id: "b0", kind: batch[1]?.kind, source: batch[1]?.source },
    ])
    expect([...translated]).toEqual([
      ["p1-b1", "결과"],
      ["p1-b2", "점수가 향상됐다."],
    ])
  })

  it("does not retry non-recoverable errors like auth or cancellation", async () => {
    const authError = new PaperAiJobError("auth")
    const onAiRequestAuth = vi.fn().mockRejectedValue(authError)

    await expect(
      translatePageBatch({ batch, page: 1, onAiRequest: onAiRequestAuth, onPartial: vi.fn() }),
    ).rejects.toThrow("auth")
    expect(onAiRequestAuth).toHaveBeenCalledTimes(1)

    const cancelError = new PaperAiJobError("cancelled")
    const onAiRequestCancel = vi.fn().mockRejectedValue(cancelError)

    await expect(
      translatePageBatch({ batch, page: 1, onAiRequest: onAiRequestCancel, onPartial: vi.fn() }),
    ).rejects.toThrow("cancelled")
    expect(onAiRequestCancel).toHaveBeenCalledTimes(1)
  })

  it("does not retry if AbortSignal was aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const onAiRequest = vi.fn().mockRejectedValue(new Error("provider unavailable"))

    await expect(
      translatePageBatch({
        batch,
        page: 1,
        onAiRequest,
        onPartial: vi.fn(),
        signal: controller.signal,
      }),
    ).rejects.toThrow()
    expect(onAiRequest).not.toHaveBeenCalled()
  })

  it("does not launch a queued request after its signal is cancelled", async () => {
    const response = JSON.stringify({
      translations: [
        { id: "b0", markdown: "결과" },
        { id: "b1", markdown: "점수가 향상됐다." },
      ],
    })
    const releases: Array<() => void> = []
    const onAiRequest = vi.fn(() =>
      releases.length < 2
        ? new Promise<string>((resolve) => releases.push(() => resolve(response)))
        : Promise.resolve(response),
    )
    const first = translatePageBatch({ batch, page: 1, onAiRequest, onPartial: vi.fn() })
    const second = translatePageBatch({ batch, page: 2, onAiRequest, onPartial: vi.fn() })
    const controller = new AbortController()
    const queued = translatePageBatch({
      batch,
      page: 3,
      onAiRequest,
      onPartial: vi.fn(),
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(onAiRequest).toHaveBeenCalledTimes(2))
    controller.abort()
    for (const release of releases) release()
    await Promise.all([first, second])
    await expect(queued).rejects.toThrow("cancelled")
    expect(onAiRequest).toHaveBeenCalledTimes(2)
  })

  it("correctly distinguishes recoverable and non-recoverable AI errors", () => {
    expect(isRecoverableAiError(new PaperAiJobError("provider_error"))).toBe(true)
    expect(isRecoverableAiError(new PaperAiJobError("timeout"))).toBe(true)
    expect(isRecoverableAiError(new PaperAiJobError("auth"))).toBe(false)
    expect(isRecoverableAiError(new PaperAiJobError("cancelled"))).toBe(false)
    expect(isRecoverableAiError(new PaperAiJobError("rate_limited"))).toBe(false)
    expect(isRecoverableAiError(new Error("rate limit exceeded"))).toBe(false)
    expect(isRecoverableAiError(new Error("unauthorized request"))).toBe(false)
    expect(isRecoverableAiError(new Error("connection reset"))).toBe(true)
  })

  it("streams partial translations as deltas arrive without corrupting order", async () => {
    const onPartial = vi.fn()
    const response = JSON.stringify({
      translations: [
        { id: "b0", markdown: "결과" },
        { id: "b1", markdown: "점수가 향상됐다." },
      ],
    })

    const onAiRequest = vi.fn(async (_req, onDelta) => {
      // Simulate streaming deltas chunk by chunk
      onDelta?.('{"translations": [{"id": "b0", "markdown": "결과"}')
      onDelta?.(', {"id": "b1", "markdown": "점수가 향상됐다."}]}')
      return response
    })

    await translatePageBatch({
      batch,
      page: 1,
      onAiRequest,
      onPartial,
    })

    // onPartial should have been called on first chunk with p1-b1
    expect(onPartial).toHaveBeenCalled()
    const firstPartialCall = onPartial.mock.calls[0]?.[0] as ReadonlyMap<string, string>
    expect(firstPartialCall.get("p1-b1")).toBe("결과")
  })

  it("extractPartialTranslations accepts known IDs in model response order", () => {
    const outOfOrderStream =
      '{"translations": [{"id": "p1-b2", "markdown": "두번째"}, {"id": "p1-b1", "markdown": "첫번째"}]}'
    const partials = extractPartialTranslations(outOfOrderStream, batch)
    expect(partials.get("p1-b2")).toBe("두번째")
    expect(partials.get("p1-b1")).toBe("첫번째")
  })

  it.each([
    [
      "extra id",
      JSON.stringify({
        translations: [
          { id: "b0", markdown: "결과" },
          { id: "extra", markdown: "추가" },
          { id: "b1", markdown: "점수가 향상됐다." },
        ],
      }),
    ],
    [
      "unknown id",
      JSON.stringify({
        translations: [
          { id: "extra", markdown: "추가" },
          { id: "b0", markdown: "결과" },
          { id: "b1", markdown: "점수가 향상됐다." },
        ],
      }),
    ],
    [
      "duplicate id",
      JSON.stringify({
        translations: [
          { id: "b0", markdown: "결과" },
          { id: "b0", markdown: "중복" },
          { id: "b1", markdown: "점수가 향상됐다." },
        ],
      }),
    ],
  ])("rejects %s before caching completion", async (_label, response) => {
    const onAiRequest = vi.fn(async () => response)

    await expect(
      translatePageBatch({ batch, page: 1, onAiRequest, onPartial: vi.fn() }),
    ).rejects.toThrow(/page translation response contains/u)
  })

  it("accepts reordered IDs while returning the request block order", async () => {
    const longBatch = [
      {
        id: "page:1:block:1:sentence:1",
        kind: "heading" as const,
        source: "Results",
      },
      {
        id: "page:1:block:27:sentence:3",
        kind: "body" as const,
        source: "The score improved.",
      },
    ] as const
    const response = JSON.stringify({
      translations: [
        { id: "b0", markdown: "결과" },
        { id: "b1", markdown: "점수가 향상됐다." },
      ],
    })

    const translated = await translatePageBatch({
      batch: longBatch,
      page: 1,
      onAiRequest: vi.fn(async () => response),
      onPartial: vi.fn(),
    })

    expect([...translated]).toEqual([
      ["page:1:block:1:sentence:1", "결과"],
      ["page:1:block:27:sentence:3", "점수가 향상됐다."],
    ])
    expect(longBatch.map((block) => translated.get(block.id))).toEqual(["결과", "점수가 향상됐다."])
  })
})
