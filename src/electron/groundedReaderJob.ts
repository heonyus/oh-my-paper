import { z } from "zod"
import { aiPolicy } from "../shared/documentAiJobs"
import { createAiCacheKey } from "./aiCacheKey"

const nodeIdSchema = z.string().regex(/^node:[a-zA-Z0-9._-]+$/u)
export const groundedReaderInputSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceNodeIds: z
      .array(nodeIdSchema)
      .min(1)
      .max(128)
      .refine((ids) => new Set(ids).size === ids.length),
    context: z.string().min(1).max(24_000),
    question: z.string().min(1).max(4_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.context.length + input.question.length > aiPolicy.readerCharacters) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "reader_input_too_large" })
    }
  })

export type GroundedReaderInput = z.infer<typeof groundedReaderInputSchema>
export type GroundedReaderCompletion = {
  readonly text: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCostUsd: number
}

export class GroundedReaderOutputError extends Error {
  readonly name = "GroundedReaderOutputError"

  constructor(readonly reason: "empty_output" | "already_complete") {
    super(reason)
  }
}

export class GroundedReaderSession {
  readonly #input: GroundedReaderInput
  #text = ""
  #complete = false

  constructor(input: GroundedReaderInput) {
    this.#input = groundedReaderInputSchema.parse(input)
  }

  push(delta: string): void {
    if (this.#complete || !delta) return
    this.#text += delta
  }

  complete(
    model: string,
    inputTokens: number,
    outputTokens: number,
    estimatedCostUsd: number,
  ): GroundedReaderCompletion {
    if (this.#complete) throw new GroundedReaderOutputError("already_complete")
    if (!model || inputTokens < 0 || outputTokens < 0 || outputTokens > aiPolicy.readerOutputTokens)
      throw new GroundedReaderOutputError("empty_output")
    if (!this.#text.trim() || this.#input.sourceNodeIds.length === 0)
      throw new GroundedReaderOutputError("empty_output")
    this.#complete = true
    return { text: this.#text, model, inputTokens, outputTokens, estimatedCostUsd }
  }

  isComplete(): boolean {
    return this.#complete
  }
}

export function groundedReaderCacheKey(
  input: GroundedReaderInput,
  provider: string,
  model: string,
  policyVersion: string,
): string {
  return createAiCacheKey({
    sourceHash: input.sourceHash,
    action: "reader",
    provider,
    model,
    promptVersion: "reader-v1",
    policyVersion,
    content: `${input.context}\n${input.question}`,
  })
}
