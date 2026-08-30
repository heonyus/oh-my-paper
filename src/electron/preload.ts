import { contextBridge, ipcRenderer } from "electron"
import {
  aiRequestSchema,
  aiResultSchema,
  aiStreamDeltaSchema,
  aiStreamRequestSchema,
  apiKeySchema,
  citationLookupRequestSchema,
  citationLookupResultSchema,
  documentBytesRequestSchema,
  documentBytesResultSchema,
  documentLayoutRequestSchema,
  documentLayoutResultSchema,
  importResultSchema,
  ipcChannels,
  openExternalRequestSchema,
  preparationUpdateSchema,
  providerConfigSchema,
  providerStatusSchema,
  type ScourgifyApi,
  workspaceReadResultSchema,
  workspaceSaveRequestSchema,
} from "../shared/ipc"

const api: ScourgifyApi = {
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
  readDocumentLayout: async (id) => {
    const request = documentLayoutRequestSchema.parse({ id })
    return documentLayoutResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.documentLayout, request),
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
  streamAi: async (request, onDelta) => {
    const id = crypto.randomUUID()
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      const update = aiStreamDeltaSchema.parse(value)
      if (update.id === id) onDelta(update.delta)
    }
    ipcRenderer.on(ipcChannels.aiStreamDelta, handler)
    try {
      return aiResultSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.aiStream,
          aiStreamRequestSchema.parse({ id, request: aiRequestSchema.parse(request) }),
        ),
      )
    } finally {
      ipcRenderer.removeListener(ipcChannels.aiStreamDelta, handler)
    }
  },
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

contextBridge.exposeInMainWorld("scourgify", api)
