import { type IpcRenderer, ipcRenderer } from "electron"
import {
  type ResearchApi,
  researchChannels,
  researchJobRequestSchema,
  researchJobResultSchema,
  researchListResultSchema,
  researchPreviewRequestSchema,
  researchSaveReportRequestSchema,
  researchStatusResultSchema,
} from "../shared/researchIpc"

export type ResearchRenderer = Pick<IpcRenderer, "invoke">

export function createResearchPreload(renderer: ResearchRenderer = ipcRenderer): ResearchApi {
  return {
    list: async () => researchListResultSchema.parse(await renderer.invoke(researchChannels.list)),
    preview: async (request) =>
      researchJobResultSchema.parse(
        await renderer.invoke(
          researchChannels.preview,
          researchPreviewRequestSchema.parse(request),
        ),
      ),
    status: async (request) =>
      researchStatusResultSchema.parse(
        await renderer.invoke(researchChannels.status, researchJobRequestSchema.parse(request)),
      ),
    start: async (request) =>
      researchJobResultSchema.parse(
        await renderer.invoke(researchChannels.start, researchJobRequestSchema.parse(request)),
      ),
    cancel: async (request) =>
      researchJobResultSchema.parse(
        await renderer.invoke(researchChannels.cancel, researchJobRequestSchema.parse(request)),
      ),
    resume: async (request) =>
      researchJobResultSchema.parse(
        await renderer.invoke(researchChannels.resume, researchJobRequestSchema.parse(request)),
      ),
    saveReport: async (request) =>
      researchJobResultSchema.parse(
        await renderer.invoke(
          researchChannels.saveReport,
          researchSaveReportRequestSchema.parse(request),
        ),
      ),
  }
}
