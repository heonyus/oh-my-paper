import { z } from "zod"

const textSpanSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().nonnegative().finite(),
  height: z.number().nonnegative().finite(),
  fontSize: z.number().nonnegative().finite(),
  fontWeight: z.number().finite(),
  rotation: z.number().finite().optional(),
})

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().nonnegative().finite(),
  height: z.number().nonnegative().finite(),
})

export const layoutRequestSchema = z.object({
  id: z.number().int().nonnegative(),
  input: z.object({
    pageNumber: z.number().int().positive(),
    pageWidth: z.number().positive().finite(),
    pageHeight: z.number().positive().finite(),
    spans: z.array(textSpanSchema),
  }),
})

const featureSchema = z.object({
  kind: z.enum(["heading", "subheading", "equation", "citation", "figure", "table"]),
  pageNumber: z.number().int().positive(),
  rect: rectSchema,
  label: z.string(),
  context: z.string(),
  priority: z.number().finite(),
  sourceSpanIds: z.array(z.string()),
})

export const layoutResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    id: z.number().int().nonnegative(),
    ok: z.literal(true),
    features: z.array(featureSchema),
  }),
  z.object({ id: z.number().int().nonnegative(), ok: z.literal(false), error: z.string() }),
])

export type LayoutRequest = z.infer<typeof layoutRequestSchema>
export type LayoutResponse = z.infer<typeof layoutResponseSchema>
