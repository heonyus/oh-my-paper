import { z } from "zod"

const translationBlockIdSchema = z.string().regex(/^[A-Za-z0-9._:-]+$/u)

export const pageTranslationResponseSchema = z
  .object({
    translations: z
      .array(
        z
          .object({
            id: translationBlockIdSchema,
            markdown: z.string().min(1).max(8_000),
          })
          .strict(),
      )
      .min(1)
      .max(128),
  })
  .strict()

export const pageTranslationResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "page_translation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["translations"],
      properties: {
        translations: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "markdown"],
            properties: {
              id: { type: "string", pattern: "^[A-Za-z0-9._:-]+$" },
              markdown: { type: "string", minLength: 1, maxLength: 8_000 },
            },
          },
        },
      },
    },
  },
} as const

export const geminiPageTranslationResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "page_translation_gemini",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["translations"],
      properties: {
        translations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "markdown"],
            properties: {
              id: { type: "string" },
              markdown: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const
