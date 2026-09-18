import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useLocalSuggestions } from "../../../src/renderer/lib/useLocalSuggestions"
import type {
  LocalInferenceApi,
  LocalInferenceStatus,
  LocalInferenceSuggestResult,
} from "../../../src/shared/localInference"

const readyStatus: LocalInferenceStatus = {
  enabled: true,
  device: { platform: "darwin", arch: "arm64", supported: true },
  setup: {
    status: "ready",
    manifest: {
      runtimePath: "/tmp/llama-server",
      runtimeArchivePath: "/tmp/llama.tar.gz",
      modelPath: "/tmp/qwen.gguf",
      runtimeVersion: "b9637",
      runtimeExecutableSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      modelRevision: "9447f74",
      licenseAccepted: true,
    },
  },
  active: false,
}

function api(suggest: LocalInferenceApi["suggest"]): LocalInferenceApi {
  return {
    getStatus: vi.fn(async () => readyStatus),
    chooseSetup: vi.fn(async () => null),
    enable: vi.fn(async () => readyStatus),
    suggest,
    cancel: vi.fn(async () => undefined),
  }
}

describe("useLocalSuggestions", () => {
  it("keeps deterministic suggestions available when the API is absent or IME is composing", () => {
    const local = api(vi.fn())
    const { result } = renderHook(
      (imeComposing: boolean) =>
        useLocalSuggestions({
          api: local,
          nodeTitle: "Attention",
          draft: "초안",
          enabled: true,
          imeComposing,
          cursorAtEnd: true,
        }),
      { initialProps: true },
    )

    expect(result.current.deterministicSuggestions).toHaveLength(3)
    expect(local.suggest).not.toHaveBeenCalled()
  })

  it("debounces explicit local inference and ignores a stale revision", async () => {
    vi.useFakeTimers()
    let resolveFirst: ((result: LocalInferenceSuggestResult) => void) | undefined
    const suggest = vi.fn((request) => {
      if (resolveFirst === undefined) {
        return new Promise<LocalInferenceSuggestResult>((resolve) => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve<LocalInferenceSuggestResult>({
        status: "ready",
        requestId: request.requestId,
        revision: request.revision,
        suggestions: ["최신 결과"],
      })
    })
    const { result, rerender } = renderHook(
      ({ draft }: { readonly draft: string }) =>
        useLocalSuggestions({
          api: api(suggest),
          nodeTitle: "Attention",
          draft,
          enabled: true,
          imeComposing: false,
          cursorAtEnd: true,
        }),
      { initialProps: { draft: "첫 초안" } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    expect(suggest).toHaveBeenCalledOnce()
    rerender({ draft: "두 번째 초안" })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    expect(result.current.localSuggestions).toEqual(["최신 결과"])

    const resolve = resolveFirst
    if (resolve === undefined) throw new Error("first request was not scheduled")
    await act(async () => {
      resolve({
        status: "ready",
        requestId: "00000000-0000-4000-8000-000000000001",
        revision: 0,
        suggestions: ["오래된 결과"],
      })
      await Promise.resolve()
    })
    expect(result.current.localSuggestions).toEqual(["최신 결과"])
    vi.useRealTimers()
  })
})
