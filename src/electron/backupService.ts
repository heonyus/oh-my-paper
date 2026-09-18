import {
  type BackupRestoreResult,
  type BackupResult,
  backupRestoreResultSchema,
  backupResultSchema,
} from "../shared/backupSchemas"
import { type CollectionId, collectionIdSchema } from "../shared/collectionSchemas"
import { createBackup, restoreBackup } from "./backupArchive"
import {
  createDirectoryBackupReader,
  createDirectoryBackupWriter,
  createDirectoryRestoreTarget,
  createFileBackupSource,
} from "./backupFiles"

export type LocalBackupRestoreRequest = {
  readonly backupRoot: string
  readonly targetRoot: string
  readonly targetCollectionId: string
}

export async function createLocalBackup(
  sourceRoot: string,
  destinationRoot: string,
  snapshotMetadata: () => Promise<Uint8Array>,
): Promise<BackupResult> {
  const source = await createFileBackupSource(sourceRoot, snapshotMetadata)
  const writer = await createDirectoryBackupWriter(destinationRoot)
  const manifest = await createBackup(source, writer)
  return backupResultSchema.parse({
    sourceCollectionId: manifest.sourceCollectionId,
    entryCount: manifest.entries.length,
    totalBytes: manifest.entries.reduce((sum, entry) => sum + entry.size, 0),
  })
}

export async function restoreLocalBackup(
  request: LocalBackupRestoreRequest,
): Promise<BackupRestoreResult> {
  const targetCollectionId: CollectionId = collectionIdSchema.parse(request.targetCollectionId)
  const result = await restoreBackup(
    await createDirectoryBackupReader(request.backupRoot),
    await createDirectoryRestoreTarget(request.targetRoot, targetCollectionId),
  )
  return backupRestoreResultSchema.parse(result)
}
