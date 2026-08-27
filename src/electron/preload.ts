import { contextBridge, ipcRenderer } from "electron"
import {
  aiRequestSchema,
  aiResultSchema,
  apiKeySchema,
  citationLookupRequestSchema,
  citationLookupResultSchema,
  documentBytesRequestSchema,
  documentBytesResultSchema,
  type HotebookApi,
  importResultSchema,
  ipcChannels,
  openExternalRequestSchema,
  preparationUpdateSchema,
  providerConfigSchema,
  providerStatusSchema,
  workspaceReadResultSchema,
  workspaceSaveRequestSchema,
} from "../shared/ipc"

const api: HotebookApi = {
  readWorkspace: async () =>
    workspaceReadResultSchema.parse(await ipcRenderer.invoke(ipcChannels.workspaceRead)),
  saveWorkspace: async (workspace) => {
    const value = workspaceSaveRequestSchema.parse(workspace)
    await ipcRenderer.invoke(ipcChannels.workspaceSave, value)
  },
  importDocument: async () =>
    importResultSchema.parse(await ipcRenderer.invoke(ipcChannels.documentImport)),
  readDocument: async (id) => {
    const request = documentBytesRequestSchema.parse({ id })
    return documentBytesResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.documentBytes, request),
    )
  },
  onPreparation: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      listener(preparationUpdateSchema.parse(value))
    }
    ipcRenderer.on(ipcChannels.preparationProgress, handler)
    return () => ipcRenderer.removeListener(ipcChannels.preparationProgress, handler)
  },
  saveApiKey: async (key) => {
    await ipcRenderer.invoke(ipcChannels.providerSaveKey, apiKeySchema.parse(key))
  },
  saveProviderConfig: async (config) => {
    await ipcRenderer.invoke(ipcChannels.providerSaveConfig, providerConfigSchema.parse(config))
  },
  providerStatus: async () =>
    providerStatusSchema.parse(await ipcRenderer.invoke(ipcChannels.providerStatus)),
  runAi: async (request) =>
    aiResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.aiRun, aiRequestSchema.parse(request)),
    ),
  lookupCitation: async (request) =>
    citationLookupResultSchema.parse(
      await ipcRenderer.invoke(
        ipcChannels.citationLookup,
        citationLookupRequestSchema.parse(request),
      ),
    ),
  openExternal: async (request) => {
    await ipcRenderer.invoke(ipcChannels.openExternal, openExternalRequestSchema.parse(request))
  },
}

contextBridge.exposeInMainWorld("hotebook", api)
