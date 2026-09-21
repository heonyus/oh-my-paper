import { describe, expect, it, vi } from "vitest"
import { openKnowledgeDatabase } from "../../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../../src/electron/knowledgeRepository"
import { createDiscoveryPreload } from "../../../src/electron/preloadDiscovery"
import { registerScholarlyIpc } from "../../../src/electron/registerScholarlyIpc"
import type { searchScholarly } from "../../../src/electron/scholarlySearch"
import type { DiscoveryApi } from "../../../src/shared/discoveryIpc"
import { discoveryChannels, discoveryJobIdSchema } from "../../../src/shared/discoveryIpc"
import {
  scholarlySearchItemSchema,
  scholarlySearchResultSchema,
} from "../../../src/shared/scholarlySearchSchemas"

type InvokeEvent = { readonly sender: { readonly id: number } }
type Handler = (event: InvokeEvent, value: unknown) => unknown

class FakeMain {
  readonly handlers = new Map<string, Handler>()

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  invoke(channel: string, value: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return Promise.resolve(handler({ sender: { id: 7 } }, value))
  }
}

const item = scholarlySearchItemSchema.parse({
  provider: "crossref",
  identity: {
    providerRecordId: "10.1000/example",
    doi: "10.1000/example",
    arxivId: null,
    openAlexId: null,
  },
  title: "Synthetic discovery result",
  authors: ["Researcher One"],
  year: 2026,
  venue: "Test Journal",
  abstract: "Metadata-only abstract.",
  landingUrl: "https://doi.org/10.1000/example",
  citationCount: 3,
  access: {
    metadata: "available",
    abstract: "available",
    fullText: { state: "unavailable", url: null },
  },
})

describe("discovery IPC", () => {
  it("owns and cancels the active search job", async () => {
    const main = new FakeMain()
    const search: typeof searchScholarly = vi.fn(async (_request, options) => {
      await new Promise<void>((resolve) =>
        options.signal?.addEventListener("abort", () => resolve()),
      )
      return scholarlySearchResultSchema.parse({
        status: "cancelled",
        query: "synthetic",
        page: 1,
        pageSize: 25,
        results: [],
        providers: [
          {
            provider: "crossref",
            status: "error",
            error: { kind: "cancelled", httpStatus: null, retryAfterSeconds: null },
          },
        ],
      })
    })
    registerScholarlyIpc({ knowledge: { findNodes: () => [], createNode: vi.fn() }, search }, main)
    const client: DiscoveryApi = createDiscoveryPreload(main)
    const jobId = discoveryJobIdSchema.parse("123e4567-e89b-42d3-a456-426614174000")
    const pending = client.search({
      jobId,
      request: { query: "synthetic", providers: ["crossref"] },
    })

    await expect(client.cancel({ jobId })).resolves.toEqual({ cancelled: true })
    await expect(pending).resolves.toMatchObject({ status: "cancelled" })
    expect(search).toHaveBeenCalledOnce()
  })

  it("saves metadata once and returns the existing node for a duplicate identity", async () => {
    const main = new FakeMain()
    const database = openKnowledgeDatabase(":memory:")
    const repository = new KnowledgeRepository(database)
    registerScholarlyIpc({ knowledge: repository }, main)
    const client = createDiscoveryPreload(main)

    const first = await client.saveMetadata({ item })
    const second = await client.saveMetadata({ item })
    const listed = await client.listSavedMetadata()
    expect(first.status).toBe("saved")
    expect(second.status).toBe("duplicate")
    expect(second.node.id).toBe(first.node.id)
    expect(first.node.body).toBe("")
    expect(first.node.aliases).toContain("doi:10.1000/example")
    expect(first.node.metadata).toMatchObject({ fullTextReviewed: false })
    expect(listed.items.map((saved) => saved.id)).toEqual([first.node.id])
    database.close()
  })

  it("removes all discovery handlers on disposal", () => {
    const main = new FakeMain()
    const dispose = registerScholarlyIpc(
      { knowledge: { findNodes: () => [], createNode: vi.fn() } },
      main,
    )
    dispose()
    expect(main.handlers.size).toBe(0)
    expect(Object.values(discoveryChannels)).toHaveLength(4)
  })
})
