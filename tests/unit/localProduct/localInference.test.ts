import { describe, expect, it, vi } from "vitest"
import { LocalInferenceService } from "../../../src/electron/localInferenceService"
import {
  buildDeterministicWritingSuggestions,
  LOCAL_INFERENCE_CANDIDATE,
  LOCAL_INFERENCE_LIMITS,
  type LocalInferenceEngine,
  type LocalInferenceSetupCheck,
  type LocalInferenceSetupManifest,
} from "../../../src/shared/localInference"

const manifest: LocalInferenceSetupManifest = {
  runtimePath: "/models/llama-cli",
  runtimeArchivePath: "/models/llama.tar.gz",
  modelPath: "/models/qwen.gguf",
  runtimeVersion: LOCAL_INFERENCE_CANDIDATE.runtime.version,
  runtimeExecutableSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  modelRevision: LOCAL_INFERENCE_CANDIDATE.model.revision,
  licenseAccepted: true,
}

const readyCheck = async (): Promise<LocalInferenceSetupCheck> => ({
  status: "ready",
  manifest,
})

describe("local inference contract", () => {
  it("pins bounded local resources without claiming a download", () => {
    expect(LOCAL_INFERENCE_CANDIDATE.runtime.version).toBe("b9637")
    expect(LOCAL_INFERENCE_CANDIDATE.runtime.archiveSha256).toBe(
      "72a93f3e68c31de3e438d462669aad1fcdb423b995e9c41033cc7d27a9a3ac69",
    )
    expect(LOCAL_INFERENCE_CANDIDATE.model.sha256).toBe(
      "57d1997790d1744fba5b40a7317df71ea5e2acee28c47e78f0cce39c0703f8cf",
    )
    expect(LOCAL_INFERENCE_CANDIDATE.model.license).toBe("Apache-2.0")
    expect(LOCAL_INFERENCE_LIMITS).toEqual({
      contextTokens: 2_048,
      maxOutputTokens: 64,
      maxCompletionCharacters: 16_384,
      startupTimeoutMs: 15_000,
      requestTimeoutMs: 30_000,
      idleUnloadMs: 60_000,
      debounceMs: 650,
    })
  })

  it("keeps deterministic suggestions free of internal markers when inference is unavailable", () => {
    expect(buildDeterministicWritingSuggestions({ title: "Attention", body: "" })).toEqual([
      "핵심 주장을 한 문장으로 정리하세요.",
      "근거가 되는 원문 구절을 연결하세요.",
      "비교 조건이 알려지지 않았다면 미상으로 남기세요.",
    ])
  })

  it("treats an unavailable native setup chooser as cancellation", async () => {
    const engine: LocalInferenceEngine = {
      complete: vi.fn().mockResolvedValue("local result"),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }
    const service = new LocalInferenceService({
      checkSetup: readyCheck,
      engine,
      initialManifest: manifest,
    })

    await expect(service.chooseSetup()).resolves.toBeNull()
    await expect(service.getStatus()).resolves.toMatchObject({
      setup: { status: "ready" },
    })
  })

  it("does not start an engine until the user explicitly enables local inference", async () => {
    const engine: LocalInferenceEngine = {
      complete: vi.fn().mockResolvedValue("local result"),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }
    const service = new LocalInferenceService({
      checkSetup: readyCheck,
      engine,
      initialManifest: manifest,
    })

    await expect(
      service.suggest({
        requestId: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        nodeTitle: "Attention",
        draft: "Draft",
      }),
    ).resolves.toMatchObject({ status: "disabled", revision: 1 })
    expect(engine.complete).not.toHaveBeenCalled()

    await service.setEnabled(true)
    await expect(
      service.suggest({
        requestId: "00000000-0000-4000-8000-000000000002",
        revision: 2,
        nodeTitle: "Attention",
        draft: "Draft",
      }),
    ).resolves.toMatchObject({ status: "ready", revision: 2 })
    expect(engine.complete).toHaveBeenCalledTimes(1)
  })

  it("returns one plain continuation without rewriting its line breaks", async () => {
    const engine: LocalInferenceEngine = {
      complete: vi.fn().mockResolvedValue("first line\n- second line"),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }
    const service = new LocalInferenceService({
      checkSetup: readyCheck,
      engine,
      initialManifest: manifest,
    })
    await service.setEnabled(true)
    await expect(
      service.suggest({
        requestId: "00000000-0000-4000-8000-000000000004",
        revision: 4,
        nodeTitle: "Attention",
        draft: "Draft",
      }),
    ).resolves.toMatchObject({ status: "ready", suggestions: ["first line\n- second line"] })
  })

  it("does not publish a response after cancellation", async () => {
    let resolveCompletion: ((text: string) => void) | undefined
    const engine: LocalInferenceEngine = {
      complete: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveCompletion = resolve
          }),
      ),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }
    const service = new LocalInferenceService({
      checkSetup: readyCheck,
      engine,
      initialManifest: manifest,
    })
    await service.setEnabled(true)
    const request = {
      requestId: "00000000-0000-4000-8000-000000000003",
      revision: 3,
      nodeTitle: "Attention",
      draft: "Draft",
    }
    const resultPromise = service.suggest(request)
    await vi.waitFor(() => expect(engine.complete).toHaveBeenCalledOnce())
    service.cancel(request.requestId)
    const resolve = resolveCompletion
    if (resolve === undefined) throw new Error("completion was not started")
    resolve("stale result")

    await expect(resultPromise).resolves.toMatchObject({ status: "cancelled", revision: 3 })
    expect(engine.cancel).toHaveBeenCalledWith(request.requestId)
  })

  it("cancels both the active and queued requests when disabled", async () => {
    let resolveCompletion: ((text: string) => void) | undefined
    const engine: LocalInferenceEngine = {
      complete: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveCompletion = resolve
          }),
      ),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }
    const service = new LocalInferenceService({
      checkSetup: readyCheck,
      engine,
      initialManifest: manifest,
    })
    await service.setEnabled(true)
    const active = service.suggest({
      requestId: "00000000-0000-4000-8000-000000000005",
      revision: 5,
      nodeTitle: "Attention",
      draft: "Draft",
    })
    await vi.waitFor(() => expect(engine.complete).toHaveBeenCalledOnce())
    const queued = service.suggest({
      requestId: "00000000-0000-4000-8000-000000000006",
      revision: 6,
      nodeTitle: "Attention",
      draft: "Next draft",
    })
    await Promise.resolve()
    await Promise.resolve()
    await service.setEnabled(false)
    await expect(queued).resolves.toMatchObject({ status: "cancelled", revision: 6 })
    const resolve = resolveCompletion
    if (resolve === undefined) throw new Error("completion was not started")
    resolve("ignored after disable")
    await expect(active).resolves.toMatchObject({ status: "cancelled", revision: 5 })
    expect(engine.cancel).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000005")
  })
})
