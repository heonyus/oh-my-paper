import { ipcRenderer } from "electron"
import {
  type ExportApi,
  exportChannels,
  exportPreviewRequestSchema,
  exportPreviewSchema,
  exportSaveRequestSchema,
  exportSaveResultSchema,
} from "../shared/exportIpc"

export function createPreloadExport(): ExportApi {
  return {
    preview: async (nodeId) =>
      exportPreviewSchema.parse(
        await ipcRenderer.invoke(
          exportChannels.preview,
          exportPreviewRequestSchema.parse({ nodeId }),
        ),
      ),
    save: async (request) =>
      exportSaveResultSchema.parse(
        await ipcRenderer.invoke(exportChannels.save, exportSaveRequestSchema.parse(request)),
      ),
  }
}
