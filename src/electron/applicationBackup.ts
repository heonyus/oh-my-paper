import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { backup } from "node:sqlite"
import { type BackupMainFactory, createBackupMainFactory } from "./backupMainService"
import type { CollectionService } from "./collectionService"
import type { WorkspaceStore } from "./workspaceStore"

export class ApplicationBackupError extends Error {
  readonly kind = "collection_mismatch"

  constructor() {
    super("WorkspaceStore and CollectionService must refer to the same collection")
    this.name = "ApplicationBackupError"
  }
}

export async function snapshotMetadataDatabase(database: DatabaseSync): Promise<Uint8Array> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "scourgify-metadata-backup-"))
  const temporaryDatabase = join(temporaryRoot, "metadata.sqlite")
  try {
    await backup(database, temporaryDatabase)
    return await readFile(temporaryDatabase)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export function createApplicationBackup(
  store: WorkspaceStore,
  collection: CollectionService,
): BackupMainFactory {
  if (store.collection !== collection) throw new ApplicationBackupError()
  return createBackupMainFactory({
    currentCollectionRoot: () => collection.collectionRoot,
    flushAndQuiesceCurrentCollection: async () => {
      await store.flush()
      await collection.rescan()
    },
    snapshotCurrentMetadataDatabase: () => snapshotMetadataDatabase(collection.repository.db),
  })
}
