import { dialog, ipcMain } from "electron"
import {
  backupChannels,
  backupCreateRequestSchema,
  backupCreateResultSchema,
  backupRestoreRequestSchema,
  backupRestoreResultSchema,
} from "../shared/backupIpc"
import type { BackupRestoreResult, BackupResult } from "../shared/backupSchemas"

export type BackupIpcService = {
  readonly create: (parentRoot: string) => Promise<BackupResult>
  readonly restore: (backupRoot: string, parentRoot: string) => Promise<BackupRestoreResult>
}

async function chooseDirectory(title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title,
    properties: ["openDirectory", "createDirectory"],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export function registerBackupIpc(service: BackupIpcService): () => void {
  ipcMain.handle(backupChannels.create, async (_event, value: unknown) => {
    backupCreateRequestSchema.parse(value)
    const parentRoot = await chooseDirectory("Choose a folder for the Scourgify backup")
    return backupCreateResultSchema.parse(parentRoot ? await service.create(parentRoot) : null)
  })
  ipcMain.handle(backupChannels.restore, async (_event, value: unknown) => {
    backupRestoreRequestSchema.parse(value)
    const backupRoot = await chooseDirectory("Choose a Scourgify backup")
    if (!backupRoot) return null
    const parentRoot = await chooseDirectory("Choose a new collection destination")
    return backupRestoreResultSchema.parse(
      parentRoot ? await service.restore(backupRoot, parentRoot) : null,
    )
  })
  return () => {
    ipcMain.removeHandler(backupChannels.create)
    ipcMain.removeHandler(backupChannels.restore)
  }
}
