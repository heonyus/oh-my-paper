import { z } from "zod"

export const documentIdSchema = z
  .string()
  .regex(/^[a-f0-9]{16}$/)
  .brand("DocumentId")
export const cardIdSchema = z.string().uuid().brand("CardId")
export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand("Sha256")

export type DocumentId = z.infer<typeof documentIdSchema>
export type CardId = z.infer<typeof cardIdSchema>
export type Sha256 = z.infer<typeof sha256Schema>
