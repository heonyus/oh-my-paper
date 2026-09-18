import type { BackupRestoreResult, BackupResult } from "./backupSchemas"
import {
  backupResultSchema,
  backupRestoreResultSchema as restoreResultSchema,
} from "./backupSchemas"

export { backupCreateRequestSchema, backupRestoreRequestSchema } from "./backupSchemas"

export const backupChannels = {
  create: "backup:create",
  restore: "backup:restore",
} as const

export const backupCreateResultSchema = backupResultSchema.nullable()
export const backupRestoreResultSchema = restoreResultSchema.nullable()

export type BackupApi = {
  readonly create: () => Promise<BackupResult | null>
  readonly restore: () => Promise<BackupRestoreResult | null>
}
