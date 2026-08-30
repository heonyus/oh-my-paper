import "dotenv/config"
import { join } from "node:path"
import { app, BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, shell } from "electron"
import {
  aiRequestSchema,
  aiResultSchema,
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
  type PreparationUpdate,
  preparationUpdateSchema,
  providerConfigSchema,
  providerStatusSchema,
  workspaceReadResultSchema,
  workspaceSaveRequestSchema,
} from "../shared/ipc"
import { CitationLookupCache } from "./citationCache"
import { DocumentLayoutService } from "./documentLayoutService"
import { importDocument, readDocumentBytes } from "./documentService"
import { externalHttpsUrl } from "./externalNavigation"
import { resolveRendererIndex } from "./paths"
import { ProviderService } from "./providerService"
import { WorkspaceStore } from "./workspaceStore"

const { SCOURGIFY_USER_DATA_DIR: configuredUserData } = process.env
if (configuredUserData) app.setPath("userData", configuredUserData)

const developmentOrigin = "http://localhost:5173"

function createStore(): WorkspaceStore {
  return new WorkspaceStore(join(app.getPath("userData"), "scourgify"))
}

function emitPreparation(event: IpcMainInvokeEvent, update: PreparationUpdate): void {
  event.sender.send(ipcChannels.preparationProgress, preparationUpdateSchema.parse(update))
}

async function chooseAndImport(event: IpcMainInvokeEvent): Promise<unknown> {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  })
  const sourcePath = result.filePaths[0]
  if (result.canceled || !sourcePath) return null

  emitPreparation(event, { step: "pdf_check", state: "active", message: "PDF 확인 중" })
  const imported = await importDocument(sourcePath, createStore())
  for (const update of [
    { step: "pdf_check", state: "complete", message: "PDF 확인 완료" },
    { step: "register", state: "complete", message: "문서 등록 완료" },
    { step: "layout", state: "complete", message: "페이지 구성 완료" },
    { step: "text_extract", state: "active", message: "텍스트 추출 준비" },
  ] satisfies readonly PreparationUpdate[]) {
    emitPreparation(event, update)
  }
  return importResultSchema.parse(imported)
}

function registerIpc(): void {
  const store = createStore()
  const provider = new ProviderService(join(app.getPath("userData"), "scourgify"))
  const citations = new CitationLookupCache(store.root)
  const { SCOURGIFY_LAYOUT_PYTHON: layoutPython } = process.env
  const layout = new DocumentLayoutService({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    packaged: app.isPackaged,
    python: layoutPython,
  })
  ipcMain.handle(ipcChannels.workspaceRead, async () =>
    workspaceReadResultSchema.parse(await store.read()),
  )
  ipcMain.handle(ipcChannels.workspaceSave, async (_event, value: unknown) => {
    await store.save(workspaceSaveRequestSchema.parse(value))
  })
  ipcMain.handle(ipcChannels.documentImport, chooseAndImport)
  ipcMain.handle(ipcChannels.providerSaveKey, async (_event, value: unknown) => {
    await provider.saveKey(apiKeySchema.parse(value))
  })
  ipcMain.handle(ipcChannels.providerSaveConfig, async (_event, value: unknown) => {
    await provider.saveConfig(providerConfigSchema.parse(value))
  })
  ipcMain.handle(ipcChannels.providerStatus, async () =>
    providerStatusSchema.parse(await provider.status()),
  )
  ipcMain.handle(ipcChannels.aiRun, async (_event, value: unknown) => {
    return aiResultSchema.parse(await provider.run(aiRequestSchema.parse(value)))
  })
  ipcMain.handle(ipcChannels.citationLookup, async (_event, value: unknown) => {
    const request = citationLookupRequestSchema.parse(value)
    return citationLookupResultSchema.parse(await citations.lookup(request))
  })
  ipcMain.handle(ipcChannels.openExternal, async (_event, value: unknown) => {
    const request = openExternalRequestSchema.parse(value)
    await shell.openExternal(request.url)
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
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1536,
    height: 1024,
    minWidth: 920,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f8f9f7",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    const external = externalHttpsUrl(url)
    if (external) void shell.openExternal(external)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || url.startsWith(developmentOrigin)) return
    event.preventDefault()
    const external = externalHttpsUrl(url)
    if (external) void shell.openExternal(external)
  })
  // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for env index signatures.
  const developmentUrl = process.env["VITE_DEV_SERVER_URL"]
  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(resolveRendererIndex(__dirname))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
