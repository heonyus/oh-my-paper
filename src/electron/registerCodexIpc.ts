import { BrowserWindow, ipcMain } from "electron"
import {
  codexAccountStatusSchema,
  codexLoginCancelRequestSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartRequestSchema,
  codexLoginStartResultSchema,
  codexModelListSchema,
} from "../shared/codexIpc"
import { ipcChannels } from "../shared/ipcChannels"
import type { CodexSubscriptionAdapter } from "./codexSubscriptionAdapter"

export function registerCodexIpc(adapter: CodexSubscriptionAdapter): () => void {
  ipcMain.handle(ipcChannels.codexStatus, async () => {
    const status = await adapter.getStatus()
    return codexAccountStatusSchema.parse(status)
  })

  ipcMain.handle(ipcChannels.codexListModels, async () =>
    codexModelListSchema.parse(await adapter.listModels()),
  )

  ipcMain.handle(ipcChannels.codexLoginStart, async (_event, value: unknown) => {
    const { type } = codexLoginStartRequestSchema.parse(value ?? {})
    const result = await adapter.startLogin(type)
    return codexLoginStartResultSchema.parse(result)
  })

  ipcMain.handle(ipcChannels.codexLoginCancel, async (_event, value: unknown) => {
    const { loginId } = codexLoginCancelRequestSchema.parse(value)
    await adapter.cancelLogin(loginId)
  })

  ipcMain.handle(ipcChannels.codexLogout, async () => {
    await adapter.logout()
  })

  adapter.onLoginCompleted((event) => {
    const payload = codexLoginCompletedEventSchema.parse(event)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(ipcChannels.codexLoginCompleted, payload)
      }
    }
  })

  return () => {
    ipcMain.removeHandler(ipcChannels.codexStatus)
    ipcMain.removeHandler(ipcChannels.codexListModels)
    ipcMain.removeHandler(ipcChannels.codexLoginStart)
    ipcMain.removeHandler(ipcChannels.codexLoginCancel)
    ipcMain.removeHandler(ipcChannels.codexLogout)
  }
}
