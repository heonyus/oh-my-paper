import { z } from "zod"
import {
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  knowledgeNodeIdSchema,
  knowledgeNodeKindSchema,
  relationPredicateSchema,
  relationProvenanceSchema,
  relationReviewStateSchema,
} from "./knowledgeSchemas"
import { sha256Schema } from "./schemas"

export const EXPORT_LIMITS = {
  assets: 64,
  assetBytes: 10 * 1024 * 1024,
  totalAssetBytes: 50 * 1024 * 1024,
  markdownCharacters: 2_000_000,
  records: 512,
  references: 512,
} as const

const portableFilenameSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u)
  .refine((value) => value !== "." && value !== "..")

export const exportAssetSchema = z
  .object({
    id: z.string().min(1).max(128),
    source: z.string().min(1).max(2_048),
    filename: portableFilenameSchema,
    mediaType: z.enum(["image/png", "image/jpeg", "image/gif"]),
    bytes: z.instanceof(Uint8Array),
    width: z.number().int().positive().max(8_192),
    height: z.number().int().positive().max(8_192),
    altText: z.string().max(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.bytes.byteLength > EXPORT_LIMITS.assetBytes) {
      context.addIssue({ code: "custom", message: "Export asset exceeds the byte limit" })
    }
  })

const exportDocumentVersionSchema = z
  .object({ id: documentVersionIdSchema, hash: sha256Schema })
  .strict()

const exportEvidenceSchema = z
  .object({
    id: evidenceAnchorIdSchema,
    documentVersionId: documentVersionIdSchema,
    page: z.number().int().positive(),
    quote: z.string().min(1).max(8_000),
  })
  .strict()

const exportRelationSchema = z
  .object({
    sourceId: knowledgeNodeIdSchema,
    targetId: knowledgeNodeIdSchema,
    predicate: relationPredicateSchema,
    reviewState: relationReviewStateSchema,
    provenance: relationProvenanceSchema,
  })
  .strict()

export const exportRecordSchema = z
  .object({
    id: knowledgeNodeIdSchema,
    kind: knowledgeNodeKindSchema,
    title: z.string().min(1).max(2_000),
    aliases: z.array(z.string().min(1).max(500)).max(256),
    documentVersions: z.array(exportDocumentVersionSchema).max(64),
    evidence: z.array(exportEvidenceSchema).max(512),
    relations: z.array(exportRelationSchema).max(512),
  })
  .strict()

export const exportBibliographyEntrySchema = z
  .object({
    key: z.string().min(1).max(128),
    text: z.string().min(1).max(8_000),
    url: z.string().max(2_048).nullable(),
  })
  .strict()

export const exportSourceReferenceSchema = z
  .object({
    id: z.string().min(1).max(256),
    label: z.string().min(1).max(2_000),
    locator: z.string().min(1).max(2_000),
    url: z.string().max(2_048).nullable(),
    availability: z.enum(["portable", "scourgify_only", "unavailable"]),
  })
  .strict()

export const exportSnapshotInputSchema = z
  .object({
    format: z.literal("scourgify-export-snapshot-v1"),
    title: z.string().min(1).max(2_000),
    revision: sha256Schema,
    markdown: z.string().max(EXPORT_LIMITS.markdownCharacters),
    records: z.array(exportRecordSchema).max(EXPORT_LIMITS.records),
    assets: z.array(exportAssetSchema).max(EXPORT_LIMITS.assets),
    bibliography: z.array(exportBibliographyEntrySchema).max(EXPORT_LIMITS.references),
    sources: z.array(exportSourceReferenceSchema).max(EXPORT_LIMITS.references),
  })
  .strict()
  .superRefine((value, context) => {
    const total = value.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0)
    if (total > EXPORT_LIMITS.totalAssetBytes) {
      context.addIssue({ code: "custom", message: "Export assets exceed the total byte limit" })
    }
    if (new Set(value.assets.map((asset) => asset.source)).size !== value.assets.length) {
      context.addIssue({ code: "custom", message: "Export asset sources must be unique" })
    }
    if (new Set(value.assets.map((asset) => asset.filename)).size !== value.assets.length) {
      context.addIssue({ code: "custom", message: "Export asset filenames must be unique" })
    }
  })

export const exportLimitationCodeSchema = z.enum([
  "missing_asset",
  "private_path_redacted",
  "source_link_unavailable",
  "suspected_secret_redacted",
  "unsafe_link_removed",
  "unsupported_html_removed",
  "unsupported_markdown_removed",
  "unsupported_math_rendered",
])

export const exportLimitationSchema = z
  .object({ code: exportLimitationCodeSchema, detail: z.string().min(1).max(2_000) })
  .strict()

export const exportFileSchema = z
  .object({
    relativePath: z.string().min(1).max(512),
    mediaType: z.enum([
      "text/markdown",
      "text/html",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
    ]),
    bytes: z.instanceof(Uint8Array),
  })
  .strict()

export const exportBundleSchema = z
  .object({
    files: z
      .array(exportFileSchema)
      .min(1)
      .max(EXPORT_LIMITS.assets + 1),
  })
  .strict()

export type ExportAsset = z.infer<typeof exportAssetSchema>
export type ExportBibliographyEntry = z.infer<typeof exportBibliographyEntrySchema>
export type ExportBundle = z.infer<typeof exportBundleSchema>
export type ExportFile = z.infer<typeof exportFileSchema>
export type ExportLimitation = z.infer<typeof exportLimitationSchema>
export type ExportRecord = z.infer<typeof exportRecordSchema>
export type ExportSnapshotInput = z.infer<typeof exportSnapshotInputSchema>
export type ExportSourceReference = z.infer<typeof exportSourceReferenceSchema>
