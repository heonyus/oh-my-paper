import { z } from "zod"
import { providerKindSchema } from "./providerModels"
import { documentIdSchema } from "./schemas"

const cacheIdentitySchema = z.object({
  id: documentIdSchema,
  pageNumber: z.number().int().positive(),
  targetLanguage: z.literal("ko"),
  provider: providerKindSchema,
  model: z.string().trim().min(1).max(160),
})

const sourceBoundsSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
})

export const cachedPageTranslationBlockSchema = z.object({
  id: z.string().min(1).max(240),
  kind: z.enum(["heading", "body"]),
  source: z.string().min(1).max(40_000),
  parsedBlockId: z.string().min(1).max(240).optional(),
  sourceBounds: sourceBoundsSchema.optional(),
  sourcePageWidth: z.number().finite().positive().optional(),
  sourcePageHeight: z.number().finite().positive().optional(),
  translation: z.string().trim().min(1).max(40_000),
})

export const pageTranslationCacheReadRequestSchema = cacheIdentitySchema
export const pageTranslationCacheWriteRequestSchema = cacheIdentitySchema.extend({
  blocks: z.array(cachedPageTranslationBlockSchema).min(1).max(2_048).readonly(),
})
export const pageTranslationCacheClearRequestSchema = cacheIdentitySchema
export const pageTranslationCacheResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing") }),
  z.object({
    status: z.literal("ready"),
    blocks: z.array(cachedPageTranslationBlockSchema).min(1).max(2_048).readonly(),
  }),
])

export type CachedPageTranslationBlock = z.infer<typeof cachedPageTranslationBlockSchema>
export type PageTranslationCacheReadRequest = z.infer<typeof pageTranslationCacheReadRequestSchema>
export type PageTranslationCacheWriteRequest = z.infer<
  typeof pageTranslationCacheWriteRequestSchema
>
export type PageTranslationCacheResult = z.infer<typeof pageTranslationCacheResultSchema>
