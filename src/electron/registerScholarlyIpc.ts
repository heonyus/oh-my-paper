import { ipcMain } from "electron"
import {
  discoveryCancelInputSchema,
  discoveryCancelResultSchema,
  discoveryChannels,
  discoverySaveInputSchema,
  discoverySaveResultSchema,
  discoverySearchInputSchema,
} from "../shared/discoveryIpc"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import type { CreateNodeInput, NodeFilter } from "../shared/knowledgeTypes"
import {
  scholarlyGraphCancelInputSchema,
  scholarlyGraphCancelResultSchema,
  scholarlyGraphChannels,
  scholarlyGraphInputSchema,
} from "../shared/scholarlyGraphIpc"
import { scholarlyGraphResultSchema } from "../shared/scholarlyGraphSchemas"
import type { ScholarlySearchItem } from "../shared/scholarlySearchSchemas"
import { scholarlySearchResultSchema } from "../shared/scholarlySearchSchemas"
import { getScholarlyGraph } from "./scholarlyGraph"
import { searchScholarly } from "./scholarlySearch"
import { defaultScholarlyTransport } from "./scholarlySearchTransport"

type ScholarlyIpcEvent = { readonly sender: { readonly id: number } }
type ScholarlyIpcHandler = (event: ScholarlyIpcEvent, value: unknown) => unknown
type ScholarlyIpc = {
  readonly handle: (channel: string, handler: ScholarlyIpcHandler) => void
  readonly removeHandler: (channel: string) => void
}
type KnowledgeWriter = {
  readonly findNodes: (filter?: NodeFilter) => readonly KnowledgeNode[]
  readonly createNode: (input: CreateNodeInput) => KnowledgeNode
}

export interface ScholarlyIpcDependencies {
  readonly knowledge: KnowledgeWriter
  readonly search?: typeof searchScholarly
  readonly graph?: typeof getScholarlyGraph
  readonly transport?: typeof defaultScholarlyTransport
}

function identityKeys(item: ScholarlySearchItem): readonly string[] {
  const values = [
    item.identity.doi ? `doi:${item.identity.doi.toLowerCase()}` : null,
    item.identity.arxivId ? `arxiv:${item.identity.arxivId.toLowerCase()}` : null,
    item.identity.openAlexId ? `openalex:${item.identity.openAlexId.toLowerCase()}` : null,
    `${item.provider}:${item.identity.providerRecordId.toLowerCase()}`,
  ]
  return [...new Set(values.filter((value): value is string => value !== null))]
}

function findDuplicate(knowledge: KnowledgeWriter, keys: readonly string[]): KnowledgeNode | null {
  for (const key of keys) {
    const nodes = knowledge.findNodes({ kind: "paper", search: key, limit: 100 })
    const duplicate = nodes.find((node) => node.aliases.some((alias) => keys.includes(alias)))
    if (duplicate) return duplicate
  }
  return null
}

function saveMetadata(knowledge: KnowledgeWriter, item: ScholarlySearchItem) {
  const aliases = identityKeys(item)
  const duplicate = findDuplicate(knowledge, aliases)
  if (duplicate) return discoverySaveResultSchema.parse({ status: "duplicate", node: duplicate })
  const node = knowledge.createNode({
    kind: "paper",
    title: item.title,
    body: "",
    aliases,
    metadata: {
      source: "scholarly_search",
      provider: item.provider,
      identity: item.identity,
      authors: item.authors,
      year: item.year,
      venue: item.venue,
      abstract: item.abstract,
      landingUrl: item.landingUrl,
      citationCount: item.citationCount,
      access: item.access,
      fullTextReviewed: false,
    },
  })
  return discoverySaveResultSchema.parse({ status: "saved", node })
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
    const operation = saveQueue.then(() => saveMetadata(dependencies.knowledge, item))
    saveQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  })
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
