import { z } from "zod"

export const JEV_DECISION_MODEL = "typesafe/jev-1.13" as const
export const JEV_DECISION_ENDPOINT = "https://openrouter.ai/api/alpha/decisions" as const
export const JEV_MAX_INPUT_CHARS = 64_000 as const

export const jevDecisionTaskSchema = z.enum(["relevance", "highlight"])

const jevCandidateIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u)
  .refine((value) => value !== "none" && value !== "unknown", {
    message: "candidate IDs reserve none and unknown for model outcomes",
  })

const jevCandidateSchema = z
  .object({
    id: jevCandidateIdSchema,
    text: z.string().trim().min(1).max(8_000),
  })
  .strict()

export const jevDecisionRequestSchema = z
  .object({
    task: jevDecisionTaskSchema,
    text: z.string().trim().min(1).max(20_000),
    candidates: z.array(jevCandidateSchema).min(1).max(32),
    instructions: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>()
    for (const [index, candidate] of value.candidates.entries()) {
      if (ids.has(candidate.id)) {
        context.addIssue({
          code: "custom",
          path: ["candidates", index, "id"],
          message: "candidate IDs must be unique",
        })
      }
      ids.add(candidate.id)
    }
    const totalCharacters =
      value.text.length +
      (value.instructions?.length ?? 0) +
      value.candidates.reduce((total, candidate) => total + candidate.text.length, 0)
    if (totalCharacters > JEV_MAX_INPUT_CHARS) {
      context.addIssue({
        code: "too_big",
        maximum: JEV_MAX_INPUT_CHARS,
        origin: "string",
        path: ["candidates"],
        inclusive: true,
        message: "decision input exceeds the total character limit",
      })
    }
  })

export const jevDecisionResultSchema = z
  .object({
    task: jevDecisionTaskSchema,
    choiceId: z.string().min(1),
    probability: z.number().finite().min(0).max(1),
    model: z.string().min(1).max(256),
    provider: z.string().min(1).max(128),
  })
  .strict()

export const jevProviderResponseSchema = z
  .object({
    model: z.string().trim().min(1).max(256),
    provider: z.string().trim().min(1).max(128),
    answers: z
      .object({
        choice: z
          .object({
            type: z.literal("choice"),
            choice: z.string().trim().min(1).max(128),
            probabilities: z.record(z.string(), z.number().finite().min(0).max(1)),
            confidence: z.number().finite().min(0).max(1),
          })
          .strict(),
      })
      .strict(),
  })
  .passthrough()

export type JevDecisionTask = z.infer<typeof jevDecisionTaskSchema>
export type JevDecisionRequest = z.infer<typeof jevDecisionRequestSchema>
export type JevDecisionResult = z.infer<typeof jevDecisionResultSchema>
