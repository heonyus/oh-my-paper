import { z } from "zod"
import { createAiCacheKey } from "./aiCacheKey"

const blockIdSchema = z.string().regex(/^block:[a-zA-Z0-9._-]+$/u)
const translationBlockSchema = z
  .object({ id: blockIdSchema, text: z.string().min(1).max(12_000) })
  .strict()

export const translationInputSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    blocks: z.array(translationBlockSchema).min(1).max(128),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.blocks.reduce((total, block) => total + block.text.length, 0) > 12_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "translation_input_too_large" })
    }
    if (new Set(input.blocks.map((block) => block.id)).size !== input.blocks.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate_translation_id" })
    }
  })

export const translationOutputSchema = z
  .object({
    mappings: z
      .array(z.object({ id: blockIdSchema, text: z.string().min(1).max(12_000) }).strict())
      .min(1)
      .max(128),
  })
  .strict()

export class TranslationOutputError extends Error {
  readonly name = "TranslationOutputError"

  constructor(readonly reason: "malformed_output") {
    super(reason)
  }
}

export type TranslationInput = z.infer<typeof translationInputSchema>
export type TranslationOutput = z.infer<typeof translationOutputSchema>

function citationLinks(text: string): readonly string[] {
  return text.match(/\[[^\]]+\]\(https:\/\/[^)]+\)/gu) ?? []
}

export function validateTranslationOutput(
  input: TranslationInput,
  output: unknown,
): TranslationOutput {
  const parsed = translationOutputSchema.safeParse(output)
  if (!parsed.success || parsed.data.mappings.length !== input.blocks.length)
    throw new TranslationOutputError("malformed_output")
  for (const [index, block] of input.blocks.entries()) {
    const mapping = parsed.data.mappings[index]
    if (
      !mapping ||
      mapping.id !== block.id ||
      citationLinks(block.text).some((link) => !mapping.text.includes(link))
    ) {
      throw new TranslationOutputError("malformed_output")
    }
  }
  return parsed.data
}

export function translationCacheKey(
  input: TranslationInput,
  provider: string,
  model: string,
  policyVersion: string,
): string {
  return createAiCacheKey({
    sourceHash: input.sourceHash,
    action: "translation",
    provider,
    model,
    promptVersion: "translation-v1",
    policyVersion,
    content: JSON.stringify(input.blocks),
  })
}
