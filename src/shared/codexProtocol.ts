import { z } from "zod"
import {
  codexAccountRateLimitsSchema,
  codexAccountSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartResultSchema,
} from "./codexTypes"

export const codexRpcIdSchema = z.union([z.string(), z.number()])
export type CodexRpcId = z.infer<typeof codexRpcIdSchema>

export const codexRpcRequestSchema = z.object({
  id: codexRpcIdSchema,
  method: z.string().min(1),
  params: z.unknown().optional(),
})
export type CodexRpcRequest = z.infer<typeof codexRpcRequestSchema>

export const codexRpcSuccessResponseSchema = z.object({
  id: codexRpcIdSchema,
  result: z.unknown(),
})
export type CodexRpcSuccessResponse = z.infer<typeof codexRpcSuccessResponseSchema>

export const codexRpcErrorObjectSchema = z.object({
  code: z.number().int().optional(),
  message: z.string(),
  data: z.unknown().optional(),
})

export const codexRpcErrorResponseSchema = z.object({
  id: codexRpcIdSchema.nullable(),
  error: codexRpcErrorObjectSchema,
})
export type CodexRpcErrorResponse = z.infer<typeof codexRpcErrorResponseSchema>

export const codexRpcResponseSchema = z.union([
  codexRpcSuccessResponseSchema,
  codexRpcErrorResponseSchema,
])
export type CodexRpcResponse = z.infer<typeof codexRpcResponseSchema>

export const codexRpcNotificationSchema = z.object({
  method: z.string().min(1),
  params: z.unknown().optional(),
})
export type CodexRpcNotification = z.infer<typeof codexRpcNotificationSchema>

export const codexRpcServerRequestSchema = z.object({
  id: codexRpcIdSchema,
  method: z.string().min(1),
  params: z.unknown().optional(),
})
export type CodexRpcServerRequest = z.infer<typeof codexRpcServerRequestSchema>

export const codexGetAccountResultSchema = z.object({
  account: codexAccountSchema.nullable(),
  requiresOpenaiAuth: z.boolean(),
})
export type CodexGetAccountResult = z.infer<typeof codexGetAccountResultSchema>

export const codexGetRateLimitsResultSchema = codexAccountRateLimitsSchema
export type CodexGetRateLimitsResult = z.infer<typeof codexGetRateLimitsResultSchema>

export const codexProviderCapabilitiesReadResultSchema = z
  .object({
    namespaceTools: z.boolean(),
    imageGeneration: z.boolean(),
    webSearch: z.boolean(),
  })
  .readonly()
export type CodexProviderCapabilitiesReadResult = z.infer<
  typeof codexProviderCapabilitiesReadResultSchema
>

export const codexModelListResultSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      displayName: z.string().optional(),
      description: z.string().optional(),
      hidden: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      supportedReasoningEfforts: z
        .array(z.object({ reasoningEffort: z.string().min(1) }))
        .optional(),
    }),
  ),
})

export const codexConfigReadResultSchema = z
  .object({
    config: z.record(z.string(), z.unknown()),
    layers: z.array(z.unknown()).optional(),
  })
  .passthrough()
export type CodexConfigReadResult = z.infer<typeof codexConfigReadResultSchema>

export const codexThreadStartResultSchema = z.object({
  thread: z.object({
    id: z.string().min(1),
  }),
})
export type CodexThreadStartResult = z.infer<typeof codexThreadStartResultSchema>

export const codexTurnStartResultSchema = z.object({
  turn: z.object({
    id: z.string().min(1),
    status: z.string().optional(),
  }),
})
export type CodexTurnStartResult = z.infer<typeof codexTurnStartResultSchema>

export const codexAgentMessageDeltaNotificationSchema = z.object({
  threadId: z.string(),
  turnId: z.string(),
  itemId: z.string().optional(),
  delta: z.string(),
})
export type CodexAgentMessageDeltaNotification = z.infer<
  typeof codexAgentMessageDeltaNotificationSchema
>

export const codexTurnCompletedNotificationSchema = z.object({
  threadId: z.string(),
  turn: z.object({
    id: z.string(),
    status: z.enum(["completed", "interrupted", "failed", "inProgress"]),
    error: z
      .object({
        message: z.string(),
      })
      .nullable()
      .optional(),
  }),
})
export type CodexTurnCompletedNotification = z.infer<typeof codexTurnCompletedNotificationSchema>

export type { CodexLoginCompletedEvent, CodexLoginStartResult } from "./codexTypes"
export { codexLoginCompletedEventSchema, codexLoginStartResultSchema }
