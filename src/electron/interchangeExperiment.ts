import { type ExperimentRecordV1, experimentRecordV1Schema } from "../shared/interchangeSchemas"
import type { ExperimentImportPreview } from "../shared/interchangeTypes"

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /(?<!max[_-]?)token/i,
  /password/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /prompt/i,
  /patient/i,
  /\bphi\b/i,
  /\bpii\b/i,
  /ssn/i,
]

export function isSensitiveKey(key: string): boolean {
  if (/max[_-]?tokens?|tokens?[_-]per[_-]sec/i.test(key)) {
    return false
  }
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))
}

export function isSensitiveValue(val: string): boolean {
  if (val.length > 256) return true
  if (/^sk-[a-zA-Z0-9_-]{20,}/.test(val)) return true
  if (/bearer\s+[a-zA-Z0-9_.-]{20,}/i.test(val)) return true
  return false
}

function checkObjectForSensitiveKeys(obj: object, prefix: string, outFound: Set<string>): void {
  for (const [k, val] of Object.entries(obj)) {
    const fullKey = prefix.length > 0 ? `${prefix}.${k}` : k
    if (isSensitiveKey(k)) {
      outFound.add(fullKey)
    }
    if (typeof val === "string" && isSensitiveValue(val)) {
      outFound.add(fullKey)
    }
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      checkObjectForSensitiveKeys(val, fullKey, outFound)
    }
  }
}

export function previewExperimentJsonl(rawLines: string): ExperimentImportPreview {
  const lines = rawLines.split("\n")
  const records: ExperimentRecordV1[] = []
  const errors: { line: number; message: string }[] = []
  const sensitiveKeysFound = new Set<string>()
  const seenRunIds = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (rawLine === undefined) {
      continue
    }
    const trimmed = rawLine.trim()
    if (trimmed.length === 0) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (err) {
      errors.push({
        line: i + 1,
        message: `Malformed JSON: ${String(err)}`,
      })
      continue
    }

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      checkObjectForSensitiveKeys(parsed, "", sensitiveKeysFound)
    }

    const validation = experimentRecordV1Schema.safeParse(parsed)
    if (!validation.success) {
      errors.push({
        line: i + 1,
        message: validation.error.message,
      })
    } else {
      if (seenRunIds.has(validation.data.runId)) {
        errors.push({
          line: i + 1,
          message: `Duplicate run ID: ${validation.data.runId}`,
        })
        continue
      }

      const configKeys = Object.keys(validation.data.aggregateConfig)
      const metricKeys = Object.keys(validation.data.aggregateMetrics)
      if (configKeys.length > 50) {
        errors.push({
          line: i + 1,
          message: `aggregateConfig exceeds maximum key limit of 50 (${configKeys.length})`,
        })
      } else if (metricKeys.length > 50) {
        errors.push({
          line: i + 1,
          message: `aggregateMetrics exceeds maximum key limit of 50 (${metricKeys.length})`,
        })
      } else {
        seenRunIds.add(validation.data.runId)
        records.push(validation.data)
      }
    }
  }

  const sensitiveKeysDetected = Array.from(sensitiveKeysFound)
  const isValid = errors.length === 0 && sensitiveKeysDetected.length === 0

  return {
    records,
    errors,
    sensitiveKeysDetected,
    isValid,
  }
}
