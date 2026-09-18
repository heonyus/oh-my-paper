import { ipcRenderer } from "electron"
import {
  type AccountApi,
  accountIpcChannels,
  accountRecoveryDraftSchema,
  accountRecoveryEntrySchema,
  accountRecoveryListChannel,
  accountRecoveryListQuerySchema,
  accountRecoveryReadChannel,
  accountRecoveryReadRequestSchema,
  accountRecoveryRecordSchema,
  accountRecoverySaveChannel,
} from "../shared/accountIpc"
import {
  accountRefreshTriggerSchema,
  accountStatusSchema,
  collectionSwitchChoiceSchema,
} from "../shared/accountSchemas"

export function createPreloadAccount(): AccountApi {
  return {
    status: async () =>
      accountStatusSchema.parse(await ipcRenderer.invoke(accountIpcChannels.status)),
    login: async () =>
      accountStatusSchema.parse(await ipcRenderer.invoke(accountIpcChannels.login)),
    cancelLogin: async () => {
      await ipcRenderer.invoke(accountIpcChannels.loginCancel)
    },
    refresh: async (trigger) =>
      accountStatusSchema.parse(
        await ipcRenderer.invoke(
          accountIpcChannels.refresh,
          accountRefreshTriggerSchema.parse(trigger),
        ),
      ),
    logout: async () => {
      await ipcRenderer.invoke(accountIpcChannels.logout)
    },
    switchCollection: async (choice) =>
      accountStatusSchema.parse(
        await ipcRenderer.invoke(
          accountIpcChannels.switchCollection,
          collectionSwitchChoiceSchema.parse(choice),
        ),
      ),
    saveRecoveryDraft: async (draft) => {
      await ipcRenderer.invoke(accountRecoverySaveChannel, accountRecoveryDraftSchema.parse(draft))
    },
    listRecoveryDrafts: async (query) =>
      accountRecoveryEntrySchema
        .array()
        .parse(
          await ipcRenderer.invoke(
            accountRecoveryListChannel,
            accountRecoveryListQuerySchema.parse(query),
          ),
        ),
    readRecoveryDraft: async (request) =>
      accountRecoveryRecordSchema.parse(
        await ipcRenderer.invoke(
          accountRecoveryReadChannel,
          accountRecoveryReadRequestSchema.parse(request),
        ),
      ),
    onStatusChanged: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        listener(accountStatusSchema.parse(value))
      }
      ipcRenderer.on(accountIpcChannels.statusChanged, receive)
      return () => ipcRenderer.removeListener(accountIpcChannels.statusChanged, receive)
    },
  }
}
