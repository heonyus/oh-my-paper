import { contextBridge, ipcRenderer, webUtils } from "electron"
import { z } from "zod"
import { createClosePreparation } from "../shared/closePreparation"
import {
  documentAnalysisRequestSchema,
  documentAnalysisSnapshotSchema,
} from "../shared/documentAnalysis"
import {
  aiJobCancelRequestSchema,
  aiJobEventSchema,
  aiJobStartRequestSchema,
  aiJobStartResultSchema,
  aiModeRequestSchema,
  aiRequestSchema,
  aiResultSchema,
  aiStreamDeltaSchema,
  aiStreamRequestSchema,
  apiKeySchema,
  citationLookupRequestSchema,
  citationLookupResultSchema,
  clipboardWriteTextRequestSchema,
  documentAstRequestSchema,
  documentAstResultSchema,
  documentBytesRequestSchema,
  documentBytesResultSchema,
  documentImportPathRequestSchema,
  documentImportPathsRequestSchema,
  documentImportUrlRequestSchema,
  documentLayoutRequestSchema,
  documentLayoutResultSchema,
  documentOcrProviderStatusSchema,
  documentPageParseProgressSchema,
  documentPageParseRequestSchema,
  documentPageParseResultSchema,
  importProgressSchema,
  importResultSchema,
  ipcChannels,
  type OhMyPaperApi,
  openExternalRequestSchema,
  preparationUpdateSchema,
  providerConfigSchema,
  providerStatusSchema,
  workspaceReadResultSchema,
  workspaceSaveRequestSchema,
} from "../shared/ipc"
import {
  pageTranslationCacheClearRequestSchema,
  pageTranslationCacheReadRequestSchema,
  pageTranslationCacheResultSchema,
  pageTranslationCacheWriteRequestSchema,
} from "../shared/pageTranslationCache"
import { unavailableWebFeature } from "../shared/unavailableWebFeatures"
import { workspacePatchRequestSchema, workspacePatchResultSchema } from "../shared/workspacePatch"
import { createPreloadAccount } from "./preloadAccount"
import { createPreloadBackup } from "./preloadBackup"
import { createBibliographyPreload } from "./preloadBibliography"
import { createPreloadCodex } from "./preloadCodex"
import { createPreloadCollection } from "./preloadCollection"
import { createDiscoveryPreload } from "./preloadDiscovery"
import { createPreloadExport } from "./preloadExport"
import { createPreloadInterchange } from "./preloadInterchange"
import { createPreloadKnowledge } from "./preloadKnowledge"
import { createPreloadLocalInference } from "./preloadLocalInference"
import { createMemoryPreloadApi } from "./preloadMemory"
import { createResearchPreload } from "./preloadResearch"
import { createPreloadScholarlyGraph } from "./preloadScholarlyGraph"

const closePreparation = createClosePreparation()
ipcRenderer.on(ipcChannels.workspacePrepareClose, () => {
  void closePreparation
    .prepare()
    .then(() => ipcRenderer.send(ipcChannels.workspaceCloseReady, true))
    .catch(() => ipcRenderer.send(ipcChannels.workspaceCloseReady, false))
})

const api: OhMyPaperApi = {
  backup: createPreloadBackup(),
  export: createPreloadExport(),
  account: createPreloadAccount(),
  research: createResearchPreload(),
  memory: createMemoryPreloadApi(ipcRenderer),
  localInference: createPreloadLocalInference(),
  bibliography: createBibliographyPreload(),
  discovery: createDiscoveryPreload(),
  scholarlyGraph: createPreloadScholarlyGraph(),
  collection: createPreloadCollection(),
  readWorkspace: async () =>
    workspaceReadResultSchema.parse(await ipcRenderer.invoke(ipcChannels.workspaceRead)),
  saveWorkspace: async (workspace) => {
    const value = workspaceSaveRequestSchema.parse(workspace)
    return workspaceReadResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.workspaceSave, value),
    )
  },
  saveWorkspacePatch: async (request) =>
    workspacePatchResultSchema.parse(
      await ipcRenderer.invoke(
        ipcChannels.workspaceSavePatch,
        workspacePatchRequestSchema.parse(request),
      ),
    ),
  importDocument: async () =>
    importResultSchema.parse(await ipcRenderer.invoke(ipcChannels.documentImport)),
  importDocumentPath: async (path) => {
    const request = documentImportPathRequestSchema.parse({ path })
    return importResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.documentImportPath, request),
    )
  },
  importDocumentPaths: async (paths) => {
    const request = documentImportPathsRequestSchema.parse({ paths })
    return z
      .array(importResultSchema)
      .parse(await ipcRenderer.invoke(ipcChannels.documentImportPaths, request))
  },
  importDocumentUrl: async (url) => {
    const request = documentImportUrlRequestSchema.parse({ url })
    return importResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.documentImportUrl, request),
    )
  },
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  onImportProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      listener(importProgressSchema.parse(value))
    }
    ipcRenderer.on(ipcChannels.importProgress, handler)
    return () => ipcRenderer.removeListener(ipcChannels.importProgress, handler)
  },
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
  parseDocumentPage: async (request) => {
    const value = documentPageParseRequestSchema.parse(request)
    return documentPageParseResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.documentPageParse, value),
    )
  },
  onDocumentPageParseProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      listener(documentPageParseProgressSchema.parse(value))
    }
    ipcRenderer.on(ipcChannels.documentPageParseProgress, handler)
    return () => ipcRenderer.removeListener(ipcChannels.documentPageParseProgress, handler)
  },
  readDocumentAnalysis: async () =>
    documentAnalysisSnapshotSchema.parse(
      await ipcRenderer.invoke(ipcChannels.documentAnalysisRead),
    ),
  onDocumentAnalysis: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      listener(documentAnalysisSnapshotSchema.parse(value))
    }
    ipcRenderer.on(ipcChannels.documentAnalysisUpdated, handler)
    return () => ipcRenderer.removeListener(ipcChannels.documentAnalysisUpdated, handler)
  },
  retryDocumentAnalysis: async (id) => {
    await ipcRenderer.invoke(
      ipcChannels.documentAnalysisRetry,
      documentAnalysisRequestSchema.parse({ id }),
    )
  },
  documentOcrStatus: async () =>
    documentOcrProviderStatusSchema.parse(await ipcRenderer.invoke(ipcChannels.documentOcrStatus)),
  readPageTranslationCache: async (request) =>
    pageTranslationCacheResultSchema.parse(
      await ipcRenderer.invoke(
        ipcChannels.pageTranslationCacheRead,
        pageTranslationCacheReadRequestSchema.parse(request),
      ),
    ),
  writePageTranslationCache: async (request) => {
    await ipcRenderer.invoke(
      ipcChannels.pageTranslationCacheWrite,
      pageTranslationCacheWriteRequestSchema.parse(request),
    )
  },
  clearPageTranslationCache: async (request) => {
    await ipcRenderer.invoke(
      ipcChannels.pageTranslationCacheClear,
      pageTranslationCacheClearRequestSchema.parse(request),
    )
  },
  readDocumentAst: async (request) => {
    const value = documentAstRequestSchema.parse(request)
    return documentAstResultSchema.parse(await ipcRenderer.invoke(ipcChannels.documentAst, value))
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
  saveAiMode: async (input) => {
    const payload = typeof input === "string" ? { mode: input } : input
    await ipcRenderer.invoke(ipcChannels.providerSaveMode, aiModeRequestSchema.parse(payload))
  },
  providerStatus: async () =>
    providerStatusSchema.parse(await ipcRenderer.invoke(ipcChannels.providerStatus)),
  agentAsk: unavailableWebFeature("agent.ask"),
  agentAskStream: unavailableWebFeature("agent.askStream"),
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
  startAiJob: async (request) =>
    aiJobStartResultSchema.parse(
      await ipcRenderer.invoke(ipcChannels.aiJobStart, aiJobStartRequestSchema.parse(request)),
    ),
  cancelAiJob: async (jobId) => {
    await ipcRenderer.invoke(ipcChannels.aiJobCancel, aiJobCancelRequestSchema.parse({ jobId }))
  },
  onAiJobEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      listener(aiJobEventSchema.parse(value))
    }
    ipcRenderer.on(ipcChannels.aiJobEvent, handler)
    return () => ipcRenderer.removeListener(ipcChannels.aiJobEvent, handler)
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
  writeClipboardText: async (text) => {
    const request = clipboardWriteTextRequestSchema.parse({ text })
    await ipcRenderer.invoke(ipcChannels.clipboardWriteText, request)
  },
  flushWorkspace: async () => {
    await ipcRenderer.invoke(ipcChannels.workspaceFlush)
  },
  onBeforeWorkspaceClose: (listener) => {
    return closePreparation.register(listener)
  },
  knowledge: createPreloadKnowledge(),
  codex: createPreloadCodex(),
  interchange: createPreloadInterchange(),
}

contextBridge.exposeInMainWorld("ohmypaper", api)
