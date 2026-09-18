import { z } from "zod"
import { sha256Schema } from "./schemas"

const localEnrichmentSchemaVersion = z.literal("1.0.0")
const localEnrichmentModelSchema = z.literal("PP-StructureV3")
const localEnrichmentOriginSchema = z.literal("local_pp_structure_v3")
const localEnrichmentBoundsSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
})
const sourceTextStrengthSchema = z.enum(["strong", "weak", "none"])
const targetKindSchema = z.enum([
  "scanned",
  "low_text",
  "table",
  "formula",
  "chart",
  "low_confidence",
])

const localEnrichmentRegionSchema = z.object({
  pageNumber: z.number().int().positive(),
  kind: z.enum(["table", "formula", "chart", "low_confidence"]),
  bounds: localEnrichmentBoundsSchema,
  confidence: z.number().min(0).max(1),
  sourceTextStrength: sourceTextStrengthSchema,
})

export const localEnrichmentPageSignalSchema = z.object({
  pageNumber: z.number().int().positive(),
  textCharacters: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  regions: z.array(localEnrichmentRegionSchema).max(16),
})

const localEnrichmentTargetSchema = z.object({
  pageNumber: z.number().int().positive(),
  kind: targetKindSchema,
  bounds: localEnrichmentBoundsSchema.optional(),
  confidence: z.number().min(0).max(1),
  sourceTextStrength: sourceTextStrengthSchema,
})

export const localEnrichmentRequestSchema = z
  .object({
    schemaVersion: localEnrichmentSchemaVersion,
    sourceHash: sha256Schema,
    pdfPath: z.string().trim().min(1).max(4_096),
    targets: z.array(localEnrichmentTargetSchema).min(1).max(8).readonly(),
  })
  .strict()

const localEnrichmentRecordSchema = z.object({
  schemaVersion: localEnrichmentSchemaVersion,
  id: z.string().regex(/^local:(layout|table|formula|ocr):[0-9]+:[0-9]+$/),
  kind: z.enum(["layout", "table", "formula", "ocr"]),
  targetKind: targetKindSchema,
  pageNumber: z.number().int().positive(),
  bounds: localEnrichmentBoundsSchema,
  text: z.string().max(4_000).nullable(),
  confidence: z.number().min(0).max(1),
  origin: localEnrichmentOriginSchema,
  model: localEnrichmentModelSchema,
  modelVersion: z.string().min(1).max(64),
  sourceTextPolicy: z.enum(["preserve_source", "ocr_fallback"]),
})

export const localEnrichmentResultSchema = z.discriminatedUnion("status", [
  z.object({
    schemaVersion: localEnrichmentSchemaVersion,
    status: z.literal("ready"),
    sourceHash: sha256Schema,
    model: localEnrichmentModelSchema,
    modelVersion: z.string().min(1).max(64),
    records: z.array(localEnrichmentRecordSchema).max(256),
  }),
  z.object({
    schemaVersion: localEnrichmentSchemaVersion,
    status: z.literal("unavailable"),
    sourceHash: sha256Schema,
    reason: z.literal("local_enrichment_unavailable"),
    detail: z.enum(["runtime_missing", "model_unavailable", "invalid_output", "execution_failed"]),
    requestedTargetCount: z.number().int().positive(),
  }),
])

export type LocalEnrichmentPageSignal = z.infer<typeof localEnrichmentPageSignalSchema>
export type LocalEnrichmentTarget = z.infer<typeof localEnrichmentTargetSchema>
export type LocalEnrichmentRequest = z.infer<typeof localEnrichmentRequestSchema>
export type LocalEnrichmentResult = z.infer<typeof localEnrichmentResultSchema>

const LOW_TEXT_THRESHOLD = 160
const LOW_CONFIDENCE_THRESHOLD = 0.72
const MAX_TARGETS = 8

function sourceTextPolicy(
  strength: LocalEnrichmentTarget["sourceTextStrength"],
): "preserve_source" | "ocr_fallback" {
  return strength === "strong" ? "preserve_source" : "ocr_fallback"
}

function targetKey(target: LocalEnrichmentTarget): string {
  const bounds = target.bounds
  return [
    target.pageNumber,
    target.kind,
    bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "page",
  ].join(":")
}

export function selectLocalEnrichmentTargets(
  signals: readonly LocalEnrichmentPageSignal[],
): readonly LocalEnrichmentTarget[] {
  const selected: LocalEnrichmentTarget[] = []
  const seen = new Set<string>()
  const append = (target: LocalEnrichmentTarget): void => {
    const key = targetKey(target)
    if (!seen.has(key) && selected.length < MAX_TARGETS) {
      seen.add(key)
      selected.push(target)
    }
  }

  for (const signal of signals) {
    if (signal.textCharacters < 24) {
      append({
        pageNumber: signal.pageNumber,
        kind: "scanned",
        confidence: signal.confidence,
        sourceTextStrength: "none",
      })
    } else if (signal.textCharacters < LOW_TEXT_THRESHOLD) {
      append({
        pageNumber: signal.pageNumber,
        kind: "low_text",
        confidence: signal.confidence,
        sourceTextStrength: "weak",
      })
    }
    if (signal.confidence < LOW_CONFIDENCE_THRESHOLD && signal.regions.length === 0) {
      append({
        pageNumber: signal.pageNumber,
        kind: "low_confidence",
        confidence: signal.confidence,
        sourceTextStrength: signal.textCharacters > 0 ? "weak" : "none",
      })
    }
    for (const region of signal.regions) {
      append(region)
    }
  }
  return selected
}

export function localEnrichmentTextPolicy(
  strength: LocalEnrichmentTarget["sourceTextStrength"],
): "preserve_source" | "ocr_fallback" {
  return sourceTextPolicy(strength)
}
