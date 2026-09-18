import { ipcMain } from "electron"
import {
  researchChannels,
  researchJobRequestSchema,
  researchJobResultSchema,
  researchListResultSchema,
  researchPreviewRequestSchema,
  researchSaveReportRequestSchema,
  researchStatusResultSchema,
} from "../shared/researchIpc"
import type { ResearchJobs } from "./researchJobs"

export interface ResearchIpcMain {
  readonly handle: (
    channel: string,
    listener: (event: unknown, payload: unknown) => Promise<unknown> | unknown,
  ) => void
  readonly removeHandler: (channel: string) => void
}

export function registerResearchIpc(
  jobs: ResearchJobs,
  providedMain?: ResearchIpcMain,
): () => Promise<void> {
  const main: ResearchIpcMain = providedMain ?? {
    handle: (channel, listener) =>
      ipcMain.handle(channel, (event, value: unknown) => listener(event, value)),
    removeHandler: (channel) => ipcMain.removeHandler(channel),
  }

  main.handle(researchChannels.list, () => researchListResultSchema.parse(jobs.list()))
  main.handle(researchChannels.preview, (_event, value) => {
    const request = researchPreviewRequestSchema.parse(value)
    return researchJobResultSchema.parse(jobs.preview(request.input))
  })
  main.handle(researchChannels.status, (_event, value) => {
    const request = researchJobRequestSchema.parse(value)
    return researchStatusResultSchema.parse(jobs.status(request.jobId))
  })
  main.handle(researchChannels.start, (_event, value) => {
    const request = researchJobRequestSchema.parse(value)
    return researchJobResultSchema.parse(jobs.start(request.jobId))
  })
  main.handle(researchChannels.cancel, (_event, value) => {
    const request = researchJobRequestSchema.parse(value)
    return researchJobResultSchema.parse(jobs.cancel(request.jobId))
  })
  main.handle(researchChannels.resume, (_event, value) => {
    const request = researchJobRequestSchema.parse(value)
    return researchJobResultSchema.parse(jobs.resume(request.jobId))
  })
  main.handle(researchChannels.saveReport, async (_event, value) => {
    const request = researchSaveReportRequestSchema.parse(value)
    return researchJobResultSchema.parse(await jobs.saveReport(request))
  })

  return async () => {
    await jobs.dispose()
    for (const channel of Object.values(researchChannels)) main.removeHandler(channel)
  }
}
