import { z } from "zod"
import type { AccountRefreshTrigger, AccountStatus, CollectionSwitchChoice } from "./accountSchemas"
import { knowledgeNodeIdSchema } from "./knowledgeSchemas"

export const accountIpcChannels = {
  status: "account:status",
  login: "account:login",
  loginCancel: "account:login-cancel",
  refresh: "account:refresh",
  logout: "account:logout",
  switchCollection: "account:switch-collection",
  statusChanged: "account:status-changed",
}

export const accountRecoverySaveChannel = "account:recovery-save"
export const accountRecoveryListChannel = "account:recovery-list"
export const accountRecoveryReadChannel = "account:recovery-read"
export const accountRecoveryRecordByteLimit = 16 * 1_024 * 1_024

export const accountRecoveryIdSchema = z.uuid().brand<"AccountRecoveryId">()

export const accountRecoveryDraftSchema = z
  .object({
    nodeId: knowledgeNodeIdSchema,
    title: z.string().min(1).max(2_000),
    body: z.string().max(2_000_000),
    expectedBody: z.string().max(2_000_000),
    aliases: z.array(z.string().min(1).max(500)).max(128),
    capturedAt: z.string().datetime(),
  })
  .strict()

export const accountRecoveryListQuerySchema = z
  .object({ limit: z.number().int().min(1).max(50) })
  .strict()
export const accountRecoveryReadRequestSchema = z
  .object({ recoveryId: accountRecoveryIdSchema, nodeId: knowledgeNodeIdSchema })
  .strict()
export const accountRecoveryEntrySchema = z
  .object({
    recoveryId: accountRecoveryIdSchema,
    nodeId: knowledgeNodeIdSchema,
    title: z.string().min(1).max(2_000),
    capturedAt: z.string().datetime(),
    bytes: z.number().int().nonnegative().max(accountRecoveryRecordByteLimit),
  })
  .strict()
export const accountRecoveryRecordSchema = z
  .object({ recoveryId: accountRecoveryIdSchema, draft: accountRecoveryDraftSchema })
  .strict()

export type AccountApi = {
  readonly status: () => Promise<AccountStatus>
  readonly login: () => Promise<AccountStatus>
  readonly cancelLogin: () => Promise<void>
  readonly refresh: (trigger: AccountRefreshTrigger) => Promise<AccountStatus>
  readonly logout: () => Promise<void>
  readonly switchCollection: (choice: CollectionSwitchChoice) => Promise<AccountStatus>
  readonly saveRecoveryDraft: (draft: AccountRecoveryDraft) => Promise<void>
  readonly listRecoveryDrafts: (
    query: AccountRecoveryListQuery,
  ) => Promise<readonly AccountRecoveryEntry[]>
  readonly readRecoveryDraft: (
    request: AccountRecoveryReadRequest,
  ) => Promise<AccountRecoveryRecord>
  readonly onStatusChanged: (listener: (status: AccountStatus) => void) => () => void
}

export type AccountRecoveryDraft = z.infer<typeof accountRecoveryDraftSchema>
export type AccountRecoveryEntry = z.infer<typeof accountRecoveryEntrySchema>
export type AccountRecoveryId = z.infer<typeof accountRecoveryIdSchema>
export type AccountRecoveryListQuery = z.infer<typeof accountRecoveryListQuerySchema>
export type AccountRecoveryReadRequest = z.infer<typeof accountRecoveryReadRequestSchema>
export type AccountRecoveryRecord = z.infer<typeof accountRecoveryRecordSchema>
