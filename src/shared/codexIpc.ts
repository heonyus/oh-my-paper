import { z } from "zod"
import {
  codexAccountStatusSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartResultSchema,
  codexLoginTypeSchema,
  codexModelListSchema,
} from "./codexTypes"

export const codexLoginStartRequestSchema = z.object({
  type: codexLoginTypeSchema.default("chatgpt").optional(),
})

export const codexLoginCancelRequestSchema = z.object({
  loginId: z.string().min(1),
})

export {
  codexAccountStatusSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartResultSchema,
  codexModelListSchema,
}
