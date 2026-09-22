import { ipcRenderer } from "electron"
import {
  codexAccountStatusSchema,
  codexLoginCancelRequestSchema,
  codexLoginCompletedEventSchema,
  codexLoginStartRequestSchema,
  codexLoginStartResultSchema,
} from "../shared/codexIpc"
import type { OhMyPaperApi } from "../shared/ipc"
import { ipcChannels } from "../shared/ipcChannels"

export function createPreloadCodex(): OhMyPaperApi["codex"] {
  return {
    getStatus: async () =>
      codexAccountStatusSchema.parse(await ipcRenderer.invoke(ipcChannels.codexStatus)),
    startLogin: async (type) =>
      codexLoginStartResultSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.codexLoginStart,
          codexLoginStartRequestSchema.parse({ type }),
        ),
      ),
    cancelLogin: async (loginId) => {
      await ipcRenderer.invoke(
        ipcChannels.codexLoginCancel,
        codexLoginCancelRequestSchema.parse({ loginId }),
      )
    },
    logout: async () => {
      await ipcRenderer.invoke(ipcChannels.codexLogout)
    },
    onLoginCompleted: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        listener(codexLoginCompletedEventSchema.parse(value))
      }
      ipcRenderer.on(ipcChannels.codexLoginCompleted, handler)
      return () => ipcRenderer.removeListener(ipcChannels.codexLoginCompleted, handler)
    },
  }
}
