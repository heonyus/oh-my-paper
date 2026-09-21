import { ipcMain } from "electron"
import {
  discoveryCancelInputSchema,
  discoveryCancelResultSchema,
  discoveryChannels,
  discoverySaveInputSchema,
  discoverySearchInputSchema,
} from "../shared/discoveryIpc"
import {
  scholarlyGraphCancelInputSchema,
  scholarlyGraphCancelResultSchema,
  scholarlyGraphChannels,
  scholarlyGraphInputSchema,
} from "../shared/scholarlyGraphIpc"
import { scholarlyGraphResultSchema } from "../shared/scholarlyGraphSchemas"
import { scholarlySearchResultSchema } from "../shared/scholarlySearchSchemas"
import { getScholarlyGraph } from "./scholarlyGraph"
import { listScholarlyMetadata, saveScholarlyMetadata } from "./scholarlyMetadata"
import { searchScholarly } from "./scholarlySearch"
import { defaultScholarlyTransport } from "./scholarlySearchTransport"

type ScholarlyIpcEvent = { readonly sender: { readonly id: number } }
type ScholarlyIpcHandler = (event: ScholarlyIpcEvent, value: unknown) => unknown
type ScholarlyIpc = {
  readonly handle: (channel: string, handler: ScholarlyIpcHandler) => void
  readonly removeHandler: (channel: string) => void
}
export interface ScholarlyIpcDependencies {
  readonly knowledge: Parameters<typeof saveScholarlyMetadata>[0]
  readonly search?: typeof searchScholarly
  readonly graph?: typeof getScholarlyGraph
  readonly transport?: typeof defaultScholarlyTransport
}

export function registerScholarlyIpc(
  dependencies: ScholarlyIpcDependencies,
  providedMain?: ScholarlyIpc,
): () => void {
  const main: ScholarlyIpc = providedMain ?? {
    handle: (channel, handler) =>
      ipcMain.handle(channel, (event, value: unknown) => handler(event, value)),
    removeHandler: (channel) => ipcMain.removeHandler(channel),
  }
  const jobs = new Map<string, AbortController>()
  const graphJobs = new Map<string, AbortController>()
  const search = dependencies.search ?? searchScholarly
  const graph = dependencies.graph ?? getScholarlyGraph
  const transport = dependencies.transport ?? defaultScholarlyTransport
  let saveQueue: Promise<void> = Promise.resolve()
  const jobKey = (event: ScholarlyIpcEvent, jobId: string): string => `${event.sender.id}:${jobId}`

  main.handle(discoveryChannels.search, async (event, value: unknown) => {
    const input = discoverySearchInputSchema.parse(value)
    const key = jobKey(event, input.jobId)
    if (jobs.has(key)) throw new Error("Discovery job is already active")
    const controller = new AbortController()
    jobs.set(key, controller)
    try {
      return scholarlySearchResultSchema.parse(
        await search(input.request, { signal: controller.signal }),
      )
    } finally {
      jobs.delete(key)
    }
  })
  main.handle(discoveryChannels.cancel, (event, value: unknown) => {
    const input = discoveryCancelInputSchema.parse(value)
    const controller = jobs.get(jobKey(event, input.jobId))
    controller?.abort()
    return discoveryCancelResultSchema.parse({ cancelled: controller !== undefined })
  })
  main.handle(discoveryChannels.saveMetadata, async (_event, value: unknown) => {
    const { item } = discoverySaveInputSchema.parse(value)
    const operation = saveQueue.then(() => saveScholarlyMetadata(dependencies.knowledge, item))
    saveQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  })
  main.handle(discoveryChannels.listSavedMetadata, () =>
    listScholarlyMetadata(dependencies.knowledge),
  )
  main.handle(scholarlyGraphChannels.get, async (event, value: unknown) => {
    const input = scholarlyGraphInputSchema.parse(value)
    const key = jobKey(event, input.jobId)
    if (graphJobs.has(key)) throw new Error("Scholarly graph job is already active")
    const controller = new AbortController()
    graphJobs.set(key, controller)
    try {
      return scholarlyGraphResultSchema.parse(
        await graph(input.request, { signal: controller.signal, transport }),
      )
    } finally {
      graphJobs.delete(key)
    }
  })
  main.handle(scholarlyGraphChannels.cancel, (event, value: unknown) => {
    const input = scholarlyGraphCancelInputSchema.parse(value)
    const controller = graphJobs.get(jobKey(event, input.jobId))
    controller?.abort()
    return scholarlyGraphCancelResultSchema.parse({ cancelled: controller !== undefined })
  })

  return () => {
    for (const controller of jobs.values()) controller.abort()
    jobs.clear()
    for (const controller of graphJobs.values()) controller.abort()
    graphJobs.clear()
    for (const channel of Object.values(discoveryChannels)) main.removeHandler(channel)
    for (const channel of Object.values(scholarlyGraphChannels)) main.removeHandler(channel)
  }
}
