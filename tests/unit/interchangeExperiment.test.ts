import { describe, expect, it } from "vitest"
import { isSensitiveKey, previewExperimentJsonl } from "../../src/electron/interchangeExperiment"

describe("Experiment JSONL v1 Adapter", () => {
  const validRecord1 = {
    format: "scourgify-experiment-v1",
    runId: "run-001",
    title: "Eval GSM8K with FewShot",
    status: "completed",
    task: "gsm8k",
    model: "openai/gpt-4o",
    codeCommit: "a1b2c3d4e5f6",
    aggregateConfig: {
      temperature: 0.7,
      max_tokens: 1024,
      limit: 100,
    },
    aggregateMetrics: {
      accuracy: 0.82,
      latency_p50: 1.2,
    },
    failureCategories: ["math_error", "timeout"],
    startedAt: "2026-09-05T10:00:00.000Z",
    completedAt: "2026-09-05T10:30:00.000Z",
  }

  const validRecord2 = {
    format: "scourgify-experiment-v1",
    runId: "run-002",
    title: "Eval GSM8K ZeroShot",
    status: "failed",
    task: "gsm8k",
    model: "anthropic/claude-3-5-sonnet",
    codeCommit: null,
    aggregateConfig: {
      temperature: 0.0,
    },
    aggregateMetrics: {
      accuracy: 0.75,
    },
    failureCategories: ["parse_error"],
    startedAt: null,
    completedAt: null,
  }

  it("parses valid JSONL records and produces a valid preview", () => {
    const jsonl = [JSON.stringify(validRecord1), JSON.stringify(validRecord2)].join("\n")
    const preview = previewExperimentJsonl(jsonl)

    expect(preview.isValid).toBe(true)
    expect(preview.records).toHaveLength(2)
    expect(preview.records[0]?.runId).toBe("run-001")
    expect(preview.records[1]?.status).toBe("failed")
    expect(preview.errors).toHaveLength(0)
    expect(preview.sensitiveKeysDetected).toHaveLength(0)
  })

  it("reports malformed lines with line numbers", () => {
    const jsonl = [
      JSON.stringify(validRecord1),
      "not a valid json line",
      JSON.stringify(validRecord2),
    ].join("\n")

    const preview = previewExperimentJsonl(jsonl)
    expect(preview.isValid).toBe(false)
    expect(preview.records).toHaveLength(2)
    expect(preview.errors).toHaveLength(1)
    expect(preview.errors[0]?.line).toBe(2)
    expect(preview.errors[0]?.message).toContain("Malformed JSON")
  })

  it("detects and rejects sensitive keys in config or top-level", () => {
    const leakedRecord = {
      ...validRecord1,
      runId: "run-leak",
      aggregateConfig: {
        ...validRecord1.aggregateConfig,
        openai_api_key: "sk-secret123",
      },
    }

    const jsonl = JSON.stringify(leakedRecord)
    const preview = previewExperimentJsonl(jsonl)

    expect(preview.isValid).toBe(false)
    expect(preview.sensitiveKeysDetected).toContain("aggregateConfig.openai_api_key")
  })

  it("rejects schema mismatches such as missing required fields", () => {
    const invalidRecord = {
      format: "scourgify-experiment-v1",
      // missing runId
      title: "Missing fields",
    }

    const preview = previewExperimentJsonl(JSON.stringify(invalidRecord))
    expect(preview.isValid).toBe(false)
    expect(preview.errors).toHaveLength(1)
    expect(preview.errors[0]?.line).toBe(1)
  })

  it("checks sensitive key patterns correctly", () => {
    expect(isSensitiveKey("api_key")).toBe(true)
    expect(isSensitiveKey("apiKey")).toBe(true)
    expect(isSensitiveKey("userToken")).toBe(true)
    expect(isSensitiveKey("password")).toBe(true)
    expect(isSensitiveKey("auth_bearer")).toBe(true)
    expect(isSensitiveKey("temperature")).toBe(false)
    expect(isSensitiveKey("max_tokens")).toBe(false)
    expect(isSensitiveKey("accuracy")).toBe(false)
  })

  it("rejects duplicate run IDs so an invalid batch cannot be committed partially", () => {
    const jsonl = [JSON.stringify(validRecord1), JSON.stringify(validRecord1)].join("\n")

    const preview = previewExperimentJsonl(jsonl)

    expect(preview.isValid).toBe(false)
    expect(preview.records).toHaveLength(1)
    expect(preview.errors[0]?.line).toBe(2)
    expect(preview.errors[0]?.message).toContain("Duplicate run ID")
  })
})
