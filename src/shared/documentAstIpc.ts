import { z } from "zod"
import { sourceDocumentAstSchema } from "./documentAst"
import { documentIdSchema, sha256Schema } from "./schemas"

export const astFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const documentAstRequestSchema = z
  .object({
    id: documentIdSchema,
    sourceHash: sha256Schema.optional(),
    fingerprint: astFingerprintSchema.optional(),
  })
  .strict()

export const documentAstResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    sourceHash: sha256Schema,
    fingerprint: astFingerprintSchema,
    ast: sourceDocumentAstSchema,
  }),
  z.object({
    status: z.literal("degraded"),
    sourceHash: sha256Schema,
    fingerprint: astFingerprintSchema,
    ast: sourceDocumentAstSchema,
    reason: z.literal("sidecar_unavailable"),
  }),
  z.object({
    status: z.literal("building"),
    sourceHash: sha256Schema,
    fingerprint: astFingerprintSchema,
  }),
  z.object({
    status: z.literal("failed"),
    reason: z.enum([
      "unknown_document",
      "stale_source",
      "source_unavailable",
      "response_too_large",
    ]),
  }),
])

export type DocumentAstRequest = z.infer<typeof documentAstRequestSchema>
export type DocumentAstResult = z.infer<typeof documentAstResultSchema>
