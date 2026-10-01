import { z } from "zod"

/** Local multilingual embeddings: a Korean note sentence can find its English source. */
export const MEANING_SEARCH_MODEL = "onnx-community/embeddinggemma-300m-ONNX"
export const MEANING_SEARCH_MAX_CANDIDATES = 200

export const meaningSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
    candidates: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(200),
            text: z.string().trim().min(1).max(4_000),
          })
          .strict(),
      )
      .min(1)
      .max(MEANING_SEARCH_MAX_CANDIDATES),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict()

export const meaningSearchResultSchema = z
  .object({
    model: z.string().min(1),
    results: z.array(z.object({ id: z.string().min(1), score: z.number().finite() }).strict()),
  })
  .strict()

export const meaningSearchStateSchema = z.enum(["idle", "loading", "ready", "failed"])
export const meaningSearchStatusSchema = z
  .object({
    state: meaningSearchStateSchema,
    /** How much of the model has downloaded, 0–100, while the first start is fetching it. */
    progress: z.number().min(0).max(100).optional(),
  })
  .strict()
export const meaningSearchStatusRequestSchema = z.object({ prepare: z.boolean() }).strict()

export type MeaningSearchRequest = z.input<typeof meaningSearchRequestSchema>
export type MeaningSearchResult = z.infer<typeof meaningSearchResultSchema>
export type MeaningSearchState = z.infer<typeof meaningSearchStateSchema>
export type MeaningSearchStatus = z.infer<typeof meaningSearchStatusSchema>
