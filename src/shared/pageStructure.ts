import { z } from "zod"

export const pageStructureKindSchema = z.enum([
  "title",
  "heading",
  "body",
  "metadata",
  "caption",
  "table",
  "equation",
  "footnote",
])

const localBlockIdSchema = z.string().regex(/^block:[A-Za-z0-9._:-]+$/u)
const resolvedBlockIdSchema = z.string().regex(/^resolved:[A-Za-z0-9._:-]+$/u)

export const pageStructureInputBlockSchema = z
  .object({
    id: localBlockIdSchema,
    text: z.string().min(1).max(2_000),
    kindHint: pageStructureKindSchema,
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict()

export const pageStructureOutputSchema = z
  .object({
    blocks: z
      .array(
        z
          .object({
            id: resolvedBlockIdSchema,
            sourceBlockIds: z.array(localBlockIdSchema).min(1).max(64),
            kind: pageStructureKindSchema,
            order: z.number().int().nonnegative(),
            markdown: z.string().min(1).max(12_000),
          })
          .strict(),
      )
      .min(1)
      .max(128),
  })
  .strict()

export const pageStructureResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "page_structure",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["blocks"],
      properties: {
        blocks: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "sourceBlockIds", "kind", "order", "markdown"],
            properties: {
              id: { type: "string", pattern: "^resolved:[A-Za-z0-9._:-]+$" },
              sourceBlockIds: {
                type: "array",
                minItems: 1,
                maxItems: 64,
                items: { type: "string", pattern: "^block:[A-Za-z0-9._:-]+$" },
              },
              kind: { type: "string", enum: pageStructureKindSchema.options },
              order: { type: "integer", minimum: 0 },
              markdown: { type: "string", minLength: 1, maxLength: 12_000 },
            },
          },
        },
      },
    },
  },
} as const

export type PageStructureKind = z.infer<typeof pageStructureKindSchema>
export type PageStructureInputBlock = z.infer<typeof pageStructureInputBlockSchema>
export type PageStructureOutput = z.infer<typeof pageStructureOutputSchema>
