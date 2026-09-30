import { BrowserWindow, ipcMain } from "electron"
import {
  documentAnalysisRequestSchema,
  documentAnalysisSnapshotSchema,
  readingFocusSchema,
} from "../shared/documentAnalysis"
import { ipcChannels } from "../shared/ipcChannels"
import type { DocumentAnalysisService } from "./documentAnalysisService"

export function registerDocumentAnalysisIpc(service: DocumentAnalysisService): () => void {
  ipcMain.handle(ipcChannels.documentAnalysisRead, () => service.snapshot())
  ipcMain.handle(ipcChannels.documentAnalysisRetry, async (_event, value: unknown) => {
    const request = documentAnalysisRequestSchema.parse(value)
    await service.reschedule(request.id)
  })
  ipcMain.handle(ipcChannels.documentReadingFocus, (_event, value: unknown) => {
    const focus = readingFocusSchema.parse(value)
    service.focus(focus.id, focus.pageNumber)
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
    ipcMain.removeHandler(ipcChannels.documentReadingFocus)
  }
}
