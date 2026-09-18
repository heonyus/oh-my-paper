import { type App, BrowserWindow, dialog, ipcMain } from "electron"
import { z } from "zod"
import { ipcChannels } from "../shared/ipcChannels"
import type { WorkspaceStore } from "./workspaceStore"

export function registerWorkspaceLifecycle(
  app: App,
  store: WorkspaceStore,
): {
  readonly flush: () => Promise<void>
  readonly dispose: () => void
} {
  const pending = new Map<number, ReturnType<typeof setTimeout>>()
  const windowListeners = new Map<BrowserWindow, (event: Electron.Event) => void>()
  let quitting = false
  const onQuit = (): void => {
    quitting = true
  }
  const fail = (id: number): void => {
    clearTimeout(pending.get(id))
    pending.delete(id)
    quitting = false
    dialog.showErrorBox(
      "저장 확인 필요",
      "최근 변경을 저장하지 못해 창을 닫지 않았습니다. 편집 내용을 확인한 뒤 다시 시도하세요.",
    )
  }
  const onWindow = (_event: Electron.Event, window: BrowserWindow): void => {
    attachWindow(window)
  }
  const attachWindow = (window: BrowserWindow): void => {
    const onClose = (event: Electron.Event): void => {
      event.preventDefault()
      const id = window.webContents.id
      if (pending.has(id)) return
      pending.set(
        id,
        setTimeout(() => fail(id), 15_000),
      )
      window.webContents.send(ipcChannels.workspacePrepareClose)
    }
    window.on("close", onClose)
    windowListeners.set(window, onClose)
  }
  const onReady = (event: Electron.IpcMainEvent, value: unknown): void => {
    const parsed = z.boolean().safeParse(value)
    const id = event.sender.id
    if (!pending.has(id)) return
    if (!parsed.success || !parsed.data) {
      fail(id)
      return
    }
    void store
      .flush()
      .then(() => {
        clearTimeout(pending.get(id))
        pending.delete(id)
        BrowserWindow.fromWebContents(event.sender)?.destroy()
        if (quitting && BrowserWindow.getAllWindows().length === 0) app.quit()
      })
      .catch(() => fail(id))
  }
  app.on("before-quit", onQuit)
  app.on("browser-window-created", onWindow)
  for (const window of BrowserWindow.getAllWindows()) attachWindow(window)
  ipcMain.on(ipcChannels.workspaceCloseReady, onReady)
  ipcMain.handle(ipcChannels.workspaceFlush, () => store.flush())
  return {
    flush: () => store.flush(),
    dispose: () => {
      for (const timer of pending.values()) clearTimeout(timer)
      for (const [window, listener] of windowListeners) window.removeListener("close", listener)
      windowListeners.clear()
      ipcMain.removeHandler(ipcChannels.workspaceFlush)
      ipcMain.removeListener(ipcChannels.workspaceCloseReady, onReady)
      app.removeListener("before-quit", onQuit)
      app.removeListener("browser-window-created", onWindow)
    },
  }
}
