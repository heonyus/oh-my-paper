import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type { BackupRestoreResult, BackupResult } from "../shared/backupSchemas"
import { collectionIdSchema } from "../shared/collectionSchemas"
import { createLocalBackup, restoreLocalBackup } from "./backupService"

export type BackupMainFactoryDependencies = {
  readonly currentCollectionRoot: () => string
  readonly flushAndQuiesceCurrentCollection: () => Promise<void>
  readonly snapshotCurrentMetadataDatabase: () => Promise<Uint8Array>
}

export type BackupMainFactory = {
  readonly create: (parentRoot: string) => Promise<BackupResult>
  readonly restore: (backupRoot: string, parentRoot: string) => Promise<BackupRestoreResult>
}

export function createBackupMainFactory(
  dependencies: BackupMainFactoryDependencies,
): BackupMainFactory {
  return {
    create: async (parentRoot) => {
      await dependencies.flushAndQuiesceCurrentCollection()
      return await createLocalBackup(
        dependencies.currentCollectionRoot(),
        join(parentRoot, `ohmypaper-backup-${randomUUID()}`),
        dependencies.snapshotCurrentMetadataDatabase,
      )
    },
    restore: async (backupRoot, parentRoot) => {
      const targetCollectionId = collectionIdSchema.parse(randomUUID())
      return await restoreLocalBackup({
        backupRoot,
        targetRoot: join(parentRoot, `ohmypaper-restored-${targetCollectionId}`),
        targetCollectionId,
      })
    },
  }
}
