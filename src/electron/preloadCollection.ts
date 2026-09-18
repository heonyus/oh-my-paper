import { ipcRenderer } from "electron"
import {
  type CollectionApi,
  collectionAssetRequestSchema,
  collectionAssetResultSchema,
  collectionChannels,
  collectionStatusSchema,
  noteConflictRequestSchema,
  noteConflictResolveSchema,
  noteConflictResultSchema,
  noteHistoryRequestSchema,
  noteHistoryResultSchema,
  noteRestoreRequestSchema,
  noteSnapshotBodySchema,
  noteSnapshotRequestSchema,
} from "../shared/collectionIpc"

export function createPreloadCollection(): CollectionApi {
  return {
    status: async () =>
      collectionStatusSchema.parse(await ipcRenderer.invoke(collectionChannels.status)),
    reveal: async () => {
      await ipcRenderer.invoke(collectionChannels.reveal)
    },
    importAsset: async (input) =>
      collectionAssetResultSchema.parse(
        await ipcRenderer.invoke(
          collectionChannels.assetImport,
          collectionAssetRequestSchema.parse(input),
        ),
      ),
    history: async (noteId) =>
      noteHistoryResultSchema.parse(
        await ipcRenderer.invoke(
          collectionChannels.history,
          noteHistoryRequestSchema.parse({ noteId }),
        ),
      ),
    preview: async (input) =>
      noteSnapshotBodySchema.parse(
        await ipcRenderer.invoke(
          collectionChannels.preview,
          noteSnapshotRequestSchema.parse(input),
        ),
      ),
    restore: async (input) => {
      await ipcRenderer.invoke(collectionChannels.restore, noteRestoreRequestSchema.parse(input))
    },
    conflict: async (conflictId) =>
      noteConflictResultSchema.parse(
        await ipcRenderer.invoke(
          collectionChannels.conflict,
          noteConflictRequestSchema.parse({ conflictId }),
        ),
      ),
    resolveConflict: async (input) => {
      await ipcRenderer.invoke(collectionChannels.resolve, noteConflictResolveSchema.parse(input))
    },
    onChanged: (listener) => {
      ipcRenderer.on(collectionChannels.changed, listener)
      return () => {
        ipcRenderer.removeListener(collectionChannels.changed, listener)
      }
    },
  }
}
