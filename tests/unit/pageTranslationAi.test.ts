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
        { id: "p1-b1", markdown: "결과" },
        { id: "p1-b2", markdown: "점수가 향상됐다." },
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
        { id: "p1-b1", markdown: "결과" },
        { id: "p1-b2", markdown: "점수가 향상됐다." },
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
        { id: "p1-b1", markdown: "결과" },
        { id: "p1-b2", markdown: "점수가 향상됐다." },
      ],
    })

    const onAiRequest = vi.fn(async (_req, onDelta) => {
      // Simulate streaming deltas chunk by chunk
      onDelta?.('{"translations": [{"id": "p1-b1", "markdown": "결과"}')
      onDelta?.(', {"id": "p1-b2", "markdown": "점수가 향상됐다."}]}')
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

  it("extractPartialTranslations ignores out of order or duplicate IDs", () => {
    // If stream contains duplicate or out of order IDs, extractPartialTranslations must not corrupt order
    const outOfOrderStream =
      '{"translations": [{"id": "p1-b2", "markdown": "두번째"}, {"id": "p1-b1", "markdown": "첫번째"}]}'
    const partials = extractPartialTranslations(outOfOrderStream, batch)
    // p1-b2 was seen first when p1-b1 was expected, so p1-b2 is skipped/not emitted out of order
    expect(partials.has("p1-b1")).toBe(false)
  })

  it.each([
    [
      "extra id",
      JSON.stringify({
        translations: [
          { id: "p1-b1", markdown: "결과" },
          { id: "extra", markdown: "추가" },
          { id: "p1-b2", markdown: "점수가 향상됐다." },
        ],
      }),
    ],
    [
      "out of order ids",
      JSON.stringify({
        translations: [
          { id: "p1-b2", markdown: "점수가 향상됐다." },
          { id: "p1-b1", markdown: "결과" },
        ],
      }),
    ],
    [
      "duplicate id",
      JSON.stringify({
        translations: [
          { id: "p1-b1", markdown: "결과" },
          { id: "p1-b1", markdown: "중복" },
          { id: "p1-b2", markdown: "점수가 향상됐다." },
        ],
      }),
    ],
  ])("rejects %s before caching completion", async (_label, response) => {
    const onAiRequest = vi.fn(async () => response)

    await expect(
      translatePageBatch({ batch, page: 1, onAiRequest, onPartial: vi.fn() }),
    ).rejects.toThrow("page translation block order mismatch")
  })
})
