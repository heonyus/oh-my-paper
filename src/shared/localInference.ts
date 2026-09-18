import { z } from "zod"

export const LOCAL_INFERENCE_LIMITS = Object.freeze({
  contextTokens: 2_048,
  maxOutputTokens: 64,
  maxCompletionCharacters: 16_384,
  startupTimeoutMs: 15_000,
  requestTimeoutMs: 30_000,
  idleUnloadMs: 60_000,
  debounceMs: 650,
})

export const LOCAL_INFERENCE_CANDIDATE = Object.freeze({
  runtime: Object.freeze({
    name: "llama.cpp",
    version: "b9637",
    archive: "llama-b9637-bin-macos-arm64.tar.gz",
    executableName: "llama-server",
    archiveSha256: "72a93f3e68c31de3e438d462669aad1fcdb423b995e9c41033cc7d27a9a3ac69",
    source: "https://github.com/ggml-org/llama.cpp/releases/tag/b9637",
  }),
  model: Object.freeze({
    name: "Qwen3.5-0.8B-Q4_0.gguf",
    repository: "ggml-org/Qwen3.5-0.8B-GGUF",
    revision: "9447f74",
    sha256: "57d1997790d1744fba5b40a7317df71ea5e2acee28c47e78f0cce39c0703f8cf",
    license: "Apache-2.0",
    source: "https://huggingface.co/ggml-org/Qwen3.5-0.8B-GGUF",
  }),
  device: "macOS Apple Silicon (arm64)",
})

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const localInferenceSetupManifestSchema = z
  .object({
    runtimePath: z.string().trim().min(1).max(4_096),
    runtimeArchivePath: z.string().trim().min(1).max(4_096),
    modelPath: z.string().trim().min(1).max(4_096),
    runtimeVersion: z.literal(LOCAL_INFERENCE_CANDIDATE.runtime.version),
    runtimeExecutableSha256: sha256Schema,
    modelRevision: z.literal(LOCAL_INFERENCE_CANDIDATE.model.revision),
    licenseAccepted: z.boolean(),
  })
  .strict()

export type LocalInferenceSetupManifest = z.infer<typeof localInferenceSetupManifestSchema>

const localInferenceUnavailableReasonSchema = z.enum([
  "disabled",
  "unsupported_device",
  "setup_required",
  "license_required",
  "runtime_missing",
  "runtime_archive_missing",
  "runtime_archive_hash_mismatch",
  "runtime_executable_hash_mismatch",
  "model_revision_mismatch",
  "model_missing",
  "model_hash_mismatch",
  "execution_failed",
  "cancelled",
])

export const localInferenceSetupCheckSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), manifest: localInferenceSetupManifestSchema }),
  z.object({
    status: z.literal("unavailable"),
    reason: localInferenceUnavailableReasonSchema,
    message: z.string().min(1),
  }),
])

export type LocalInferenceSetupCheck = z.infer<typeof localInferenceSetupCheckSchema>

export const localInferenceStatusSchema = z.object({
  enabled: z.boolean(),
  device: z.object({
    platform: z.string().min(1),
    arch: z.string().min(1),
    supported: z.boolean(),
  }),
  setup: localInferenceSetupCheckSchema,
  active: z.boolean(),
})

export type LocalInferenceStatus = z.infer<typeof localInferenceStatusSchema>

export const localInferenceSuggestRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    nodeTitle: z.string().trim().max(500),
    draft: z.string().max(20_000),
  })
  .strict()

export type LocalInferenceSuggestRequest = z.infer<typeof localInferenceSuggestRequestSchema>

export const localInferenceSuggestResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    requestId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    suggestions: z.array(z.string().min(1).max(500)).max(8).readonly(),
  }),
  z.object({
    status: z.enum(["disabled", "unavailable", "cancelled"]),
    requestId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    reason: localInferenceUnavailableReasonSchema,
  }),
])

export type LocalInferenceSuggestResult = z.infer<typeof localInferenceSuggestResultSchema>

export const localInferenceEnableRequestSchema = z.object({ enabled: z.boolean() }).strict()
export const localInferenceCancelRequestSchema = z.object({ requestId: z.string().uuid() }).strict()

export const localInferenceChannels = Object.freeze({
  status: "local-inference:status",
  chooseSetup: "local-inference:choose-setup",
  enable: "local-inference:enable",
  suggest: "local-inference:suggest",
  cancel: "local-inference:cancel",
})

export type LocalInferenceEngine = {
  readonly complete: (
    request: LocalInferenceSuggestRequest,
    manifest: LocalInferenceSetupManifest,
  ) => Promise<string>
  readonly cancel: (requestId: string) => void
  readonly dispose: () => void
}

export type LocalInferenceApi = {
  readonly getStatus: () => Promise<LocalInferenceStatus>
  readonly chooseSetup: () => Promise<LocalInferenceSetupManifest | null>
  readonly enable: (enabled: boolean) => Promise<LocalInferenceStatus>
  readonly suggest: (request: LocalInferenceSuggestRequest) => Promise<LocalInferenceSuggestResult>
  readonly cancel: (requestId: string) => Promise<void>
}

export function buildDeterministicWritingSuggestions(input: {
  readonly title: string
  readonly body: string
}): readonly string[] {
  const hasBody = input.body.trim().length > 0
  return [
    hasBody
      ? `${input.title.trim() || "이 개념"}의 핵심 주장을 한 문장으로 압축하세요.`
      : "핵심 주장을 한 문장으로 정리하세요.",
    "근거가 되는 원문 구절을 연결하세요.",
    "비교 조건이 알려지지 않았다면 미상으로 남기세요.",
  ]
}
