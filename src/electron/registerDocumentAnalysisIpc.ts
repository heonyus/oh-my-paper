import { BrowserWindow, ipcMain } from "electron"
import {
  documentAnalysisRequestSchema,
  documentAnalysisSnapshotSchema,
} from "../shared/documentAnalysis"
import { ipcChannels } from "../shared/ipcChannels"
import type { DocumentAnalysisService } from "./documentAnalysisService"

export function registerDocumentAnalysisIpc(service: DocumentAnalysisService): () => void {
  ipcMain.handle(ipcChannels.documentAnalysisRead, () => service.snapshot())
  ipcMain.handle(ipcChannels.documentAnalysisRetry, async (_event, value: unknown) => {
    const request = documentAnalysisRequestSchema.parse(value)
    await service.reschedule(request.id)
  })
  const unsubscribe = service.subscribe((snapshot) => {
    const value = documentAnalysisSnapshotSchema.parse(snapshot)
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed())
        window.webContents.send(ipcChannels.documentAnalysisUpdated, value)
    }
  })
  return () => {
    unsubscribe()
    ipcMain.removeHandler(ipcChannels.documentAnalysisRead)
    ipcMain.removeHandler(ipcChannels.documentAnalysisRetry)
  }
}
