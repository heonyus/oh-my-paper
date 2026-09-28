import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron"
import { collectionChannels } from "../shared/collectionIpc"
import {
  citationLookupRequestSchema,
  citationLookupResultSchema,
  clipboardWriteTextRequestSchema,
  documentBytesRequestSchema,
  documentBytesResultSchema,
  documentImportPathRequestSchema,
  documentImportPathsRequestSchema,
  documentImportUrlRequestSchema,
  documentLayoutRequestSchema,
  documentLayoutResultSchema,
  documentPageParseProgressSchema,
  documentPageParseRequestSchema,
  documentPageParseResultSchema,
  ipcChannels,
  openExternalRequestSchema,
  workspaceReadResultSchema,
  workspaceSaveRequestSchema,
} from "../shared/ipc"
import { downloadRemotePdf } from "../shared/remotePdf"
import { AiModeStore } from "./aiModeStore"
import { createApplicationBackup } from "./applicationBackup"
import { createApplicationExport } from "./applicationExport"
import { createApplicationLocalInference } from "./applicationLocalInference"
import { registerCollectionMemory } from "./applicationMemory"
import { createApplicationResearch } from "./applicationResearch"
import { createLocalResearchReader } from "./applicationResearchSources"
import { BibliographyService } from "./bibliographyService"
import { CitationLookupCache } from "./citationCache"
import { CodexSubscriptionAdapter } from "./codexSubscriptionAdapter"
import { registerCollectionAssetProtocol } from "./collectionAssetProtocol"
import { CollectionWatcher } from "./collectionWatcher"
import { DocumentAnalysisService } from "./documentAnalysisService"
import { DocumentAstService } from "./documentAstService"
import { chooseAndImport, importFromPath, importPaths } from "./documentImportIpc"
import { DocumentLayoutService } from "./documentLayoutService"
import { createDocumentPageParser } from "./documentPageParser"
import { readDocumentBytes } from "./documentService"
import { InterchangeService } from "./interchangeService"
import { PaddlePageParserService } from "./paddlePageParserService"
import { PageTranslationCacheService } from "./pageTranslationCacheService"
import { ProviderService } from "./providerService"
import { registerBackupIpc } from "./registerBackupIpc"
import { registerBibliographyIpc } from "./registerBibliographyIpc"
import { registerCodexIpc } from "./registerCodexIpc"
import { registerCollectionIpc } from "./registerCollectionIpc"
import { registerDocumentAnalysisIpc } from "./registerDocumentAnalysisIpc"
import { registerDocumentAstIpc } from "./registerDocumentAstIpc"
import { registerExportIpc } from "./registerExportIpc"
import { registerInterchangeIpc } from "./registerInterchangeIpc"
import { registerKnowledgeIpc } from "./registerKnowledgeIpc"
import { registerKnowledgeProposalIpc } from "./registerKnowledgeProposalIpc"
import { registerLocalInferenceIpc } from "./registerLocalInferenceIpc"
import { registerPageTranslationCacheIpc } from "./registerPageTranslationCacheIpc"
import { registerProviderIpc } from "./registerProviderIpc"
import { registerResearchIpc } from "./registerResearchIpc"
import { registerScholarlyIpc } from "./registerScholarlyIpc"
import { ResearchJobStore } from "./researchJobStore"
import { registerWorkspaceLifecycle } from "./workspaceLifecycle"
import type { WorkspaceStore } from "./workspaceStore"

export function registerApplicationIpc(
  store: WorkspaceStore,
  serviceRoot: string,
  authorize: () => Promise<void>,
): () => Promise<void> {
  const collection = store.collectionService
  const disposeMemory = collection ? registerCollectionMemory(collection) : null
  const changed = (): void => {
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send(collectionChannels.changed)
  }
  const watcher = collection ? CollectionWatcher.start(collection, changed) : null
  const disposeCollection = collection ? registerCollectionIpc(collection, changed) : null
  const disposeAssets = collection
    ? registerCollectionAssetProtocol(collection.files.root, authorize)
    : null
  const provider = new ProviderService(serviceRoot)
  const codexAdapter = new CodexSubscriptionAdapter({ appRoot: serviceRoot })
  const aiModes = new AiModeStore(serviceRoot)
  const ast = new DocumentAstService(store)
  const disposeResearch = collection
    ? registerResearchIpc(
        createApplicationResearch({
          store: new ResearchJobStore(store.repository.db),
          createNode: (input) => collection.createNode(input),
          codexAdapter,
          readLocalSource: createLocalResearchReader(store, collection, ast),
        }),
      )
    : null
  const interchangeService = new InterchangeService(store.repository, {
    ...(collection ? { collection } : {}),
  })
  const lifecycle = registerWorkspaceLifecycle(app, store)
  const disposeKnowledgeIpc = registerKnowledgeIpc(store.repository, collection ?? undefined)
  const disposeBibliography = registerBibliographyIpc(new BibliographyService(store.repository))
  const disposeBackup = collection
    ? registerBackupIpc(createApplicationBackup(store, collection))
    : null
  const disposeExport = collection
    ? registerExportIpc(createApplicationExport(store, collection))
    : null
  const localInference = createApplicationLocalInference(serviceRoot)
  const disposeLocalInference = registerLocalInferenceIpc(localInference.service)
  const disposeScholarly = registerScholarlyIpc({ knowledge: store.repository })
  const disposeProposals = registerKnowledgeProposalIpc(
    store.repository,
    provider,
    codexAdapter,
    aiModes,
  )
  const disposeCodexIpc = registerCodexIpc(codexAdapter)
  const disposeInterchangeIpc = registerInterchangeIpc(interchangeService)
  const providerIpc = registerProviderIpc(provider, codexAdapter, aiModes)
  const citations = new CitationLookupCache(store.root)
  const { OH_MY_PAPER_LAYOUT_PYTHON: layoutPython } = process.env
  const layout = new DocumentLayoutService({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
    python: layoutPython,
  })
  const {
    OH_MY_PAPER_PADDLE_VL_PYTHON: paddlePython,
    OH_MY_PAPER_PADDLE_VL_READY: paddleReadinessMarker,
  } = process.env
  const paddlePageParser = new PaddlePageParserService({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
    python: paddlePython,
    readinessMarker: paddleReadinessMarker,
  })
  const pageParser = createDocumentPageParser({
    store,
    paddlePageParser,
  })
  const analysis = new DocumentAnalysisService(store, pageParser, { maxConcurrency: 4 })
  const disposeAnalysisIpc = registerDocumentAnalysisIpc(analysis)
  const disposeTranslationCacheIpc = registerPageTranslationCacheIpc(
    new PageTranslationCacheService(store),
  )
  void analysis.resumePending()
  registerDocumentAstIpc(ast)
  ipcMain.handle(ipcChannels.workspaceRead, async () =>
    workspaceReadResultSchema.parse(await store.read()),
  )
  ipcMain.handle(ipcChannels.workspaceSave, async (_event, value: unknown) => {
    return workspaceReadResultSchema.parse(
      await store.save(workspaceSaveRequestSchema.parse(value)),
    )
  })
  ipcMain.handle(ipcChannels.documentImport, (event) => chooseAndImport(event, analysis, store))
  ipcMain.handle(ipcChannels.documentImportPath, async (event, value: unknown) => {
    const { path } = documentImportPathRequestSchema.parse(value)
    return importFromPath(event, path, analysis, store)
  })
  ipcMain.handle(ipcChannels.documentImportPaths, async (event, value: unknown) => {
    const { paths } = documentImportPathsRequestSchema.parse(value)
    return importPaths(event, paths, analysis, store)
  })
  ipcMain.handle(ipcChannels.documentImportUrl, async (event, value: unknown) => {
    const { url } = documentImportUrlRequestSchema.parse(value)
    const { bytes, fileName } = await downloadRemotePdf(url)
    const temporaryDir = await mkdtemp(join(tmpdir(), "ohmypaper-import-"))
    const temporaryPath = join(temporaryDir, fileName)
    await writeFile(temporaryPath, bytes, { mode: 0o600 })
    try {
      return await importFromPath(event, temporaryPath, analysis, store)
    } finally {
      await rm(temporaryDir, { recursive: true, force: true }).catch(() => undefined)
    }
  })
  ipcMain.handle(ipcChannels.citationLookup, async (_event, value: unknown) => {
    const request = citationLookupRequestSchema.parse(value)
    return citationLookupResultSchema.parse(await citations.lookup(request))
  })
  ipcMain.handle(ipcChannels.openExternal, async (_event, value: unknown) => {
    const request = openExternalRequestSchema.parse(value)
    await shell.openExternal(request.url)
  })
  ipcMain.handle(ipcChannels.clipboardWriteText, (_event, value: unknown) => {
    const request = clipboardWriteTextRequestSchema.parse(value)
    clipboard.writeText(request.text)
  })
  ipcMain.handle(ipcChannels.documentBytes, async (_event, value: unknown) => {
    const request = documentBytesRequestSchema.parse(value)
    const bytes = await readDocumentBytes(request.id, store)
    return documentBytesResultSchema.parse(bytes.toString("base64"))
  })
  ipcMain.handle(ipcChannels.documentLayout, async (_event, value: unknown) => {
    const request = documentLayoutRequestSchema.parse(value)
    return documentLayoutResultSchema.parse(await layout.analyze(request.id, store))
  })
  ipcMain.handle(ipcChannels.documentPageParse, async (_event, value: unknown) => {
    const request = documentPageParseRequestSchema.parse(value)
    return documentPageParseResultSchema.parse(
      await pageParser.parse({
        documentId: request.id,
        pageNumber: request.pageNumber,
        store,
        ...(request.forceOcr ? { forceOcr: true } : {}),
        onProgress: (progress) => {
          if (_event.sender.isDestroyed()) return
          _event.sender.send(
            ipcChannels.documentPageParseProgress,
            documentPageParseProgressSchema.parse(progress),
          )
        },
      }),
    )
  })
  ipcMain.handle(ipcChannels.documentOcrStatus, () => paddlePageParser.status())
  return async () => {
    disposeLocalInference()
    localInference.dispose()
    await disposeResearch?.()
    await watcher?.close()
    disposeCollection?.()
    disposeMemory?.()
    disposeAssets?.()
    disposeKnowledgeIpc()
    disposeBibliography()
    disposeBackup?.()
    disposeExport?.()
    disposeScholarly()
    disposeProposals()
    disposeCodexIpc()
    disposeInterchangeIpc()
    providerIpc.dispose()
    lifecycle.dispose()
    codexAdapter.dispose()
    disposeAnalysisIpc()
    disposeTranslationCacheIpc()
    await analysis.dispose()
    paddlePageParser.dispose()
    for (const channel of Object.values(ipcChannels)) ipcMain.removeHandler(channel)
    await store.close()
  }
}
