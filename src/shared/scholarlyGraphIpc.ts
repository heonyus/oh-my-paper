import { z } from "zod"
import {
  scholarlyGraphRequestSchema,
  type scholarlyGraphResultSchema,
} from "./scholarlyGraphSchemas"

export const scholarlyGraphChannels = {
  get: "discovery:scholarly-graph",
  cancel: "discovery:scholarly-graph-cancel",
} as const

export const scholarlyGraphJobIdSchema = z.string().uuid().brand("ScholarlyGraphJobId")
export const scholarlyGraphInputSchema = z
  .object({
    jobId: scholarlyGraphJobIdSchema,
    request: scholarlyGraphRequestSchema,
  })
  .readonly()
export const scholarlyGraphCancelInputSchema = z
  .object({ jobId: scholarlyGraphJobIdSchema })
  .readonly()
export const scholarlyGraphCancelResultSchema = z.object({ cancelled: z.boolean() }).readonly()

export interface ScholarlyGraphApi {
  readonly get: (input: ScholarlyGraphInput) => Promise<z.infer<typeof scholarlyGraphResultSchema>>
  readonly cancel: (input: ScholarlyGraphCancelInput) => Promise<ScholarlyGraphCancelResult>
}

export type ScholarlyGraphJobId = z.infer<typeof scholarlyGraphJobIdSchema>
export type ScholarlyGraphInput = z.input<typeof scholarlyGraphInputSchema>
export type ScholarlyGraphCancelInput = z.infer<typeof scholarlyGraphCancelInputSchema>
export type ScholarlyGraphCancelResult = z.infer<typeof scholarlyGraphCancelResultSchema>
