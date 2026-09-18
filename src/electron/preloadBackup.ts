import { ipcRenderer } from "electron"
import {
  type BackupApi,
  backupChannels,
  backupCreateRequestSchema,
  backupCreateResultSchema,
  backupRestoreRequestSchema,
  backupRestoreResultSchema,
} from "../shared/backupIpc"

export function createPreloadBackup(): BackupApi {
  return {
    create: async () =>
      backupCreateResultSchema.parse(
        await ipcRenderer.invoke(backupChannels.create, backupCreateRequestSchema.parse({})),
      ),
    restore: async () =>
      backupRestoreResultSchema.parse(
        await ipcRenderer.invoke(backupChannels.restore, backupRestoreRequestSchema.parse({})),
      ),
  }
}
