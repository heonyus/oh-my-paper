import { join } from "node:path"
import { migrateLegacyCollection, readActiveCollection } from "./collectionMigration"
import { collectionIndexFile, collectionRootForId } from "./collectionPaths"
import { WorkspaceStore } from "./workspaceStore"

export async function openApplicationStore(userDataRoot: string): Promise<WorkspaceStore> {
  const active = await readActiveCollection(userDataRoot)
  const collectionId =
    active?.collectionId ??
    (await migrateLegacyCollection(join(userDataRoot, "ohmypaper"), userDataRoot)).collectionId
  return WorkspaceStore.openCollection(
    collectionRootForId(userDataRoot, collectionId),
    collectionIndexFile(userDataRoot, collectionId),
  )
}
