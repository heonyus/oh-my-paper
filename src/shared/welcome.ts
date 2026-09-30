import { z } from "zod"

/** Whether this data folder has been through the first-run welcome (intro page, then 사용법). */
export const welcomeStatusSchema = z.object({ seen: z.boolean() })

export type WelcomeStatus = z.infer<typeof welcomeStatusSchema>
