import { ipcMain } from "electron"
import { ipcChannels } from "../shared/ipcChannels"
import { workspacePatchRequestSchema, workspacePatchResultSchema } from "../shared/workspacePatch"
import type { WorkspaceStore } from "./workspaceStore"

/**
 * Serves renderer patch saves beside the full save; the application removes the handler with
 * every other `ipcChannels` handler when it unmounts.
 */
export function registerWorkspacePatchIpc(store: Pick<WorkspaceStore, "savePatch">): void {
  ipcMain.handle(ipcChannels.workspaceSavePatch, async (_event, value: unknown) =>
    workspacePatchResultSchema.parse(
      await store.savePatch(workspacePatchRequestSchema.parse(value)),
    ),
  )
}
