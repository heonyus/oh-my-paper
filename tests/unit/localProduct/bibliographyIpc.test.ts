// @vitest-environment node
import { describe, expect, it } from "vitest"
import { BibliographyService } from "../../../src/electron/bibliographyService"
import { createBibliographyPreload } from "../../../src/electron/preloadBibliography"
import { registerBibliographyIpc } from "../../../src/electron/registerBibliographyIpc"
import { bibliographyChannels } from "../../../src/shared/bibliographyIpc"
import { knowledgeNodeIdSchema, knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"
import type { KnowledgeNode, KnowledgeNodeId } from "../../../src/shared/knowledgeTypes"

type Handler = (value: unknown) => unknown

class FakeIpc {
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
    return Promise.resolve(handler(value))
  }
}

const paperNode = knowledgeNodeSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "paper",
  title: "Synthetic paper",
  body: "",
  aliases: [],
  metadata: { authors: ["Minji Park"], year: 2026 },
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
})

describe("bibliography IPC", () => {
  it("validates the preload round trip and removes every handler", async () => {
    // Given
    const ipc = new FakeIpc()
    const repository = {
      getNode: (id: KnowledgeNodeId): KnowledgeNode | null =>
        id === paperNode.id ? paperNode : null,
      findNodes: (): readonly KnowledgeNode[] => [paperNode],
      updateNode: (): KnowledgeNode => paperNode,
    }
    const dispose = registerBibliographyIpc(new BibliographyService(repository), ipc)
    const client = createBibliographyPreload(ipc)

    // When
    const result = await client.getPaper(knowledgeNodeIdSchema.parse(paperNode.id))

    // Then
    expect(result.metadata.citationKey).toBe("park2026synthetic")
    expect(ipc.handlers.size).toBe(Object.values(bibliographyChannels).length)
    dispose()
    expect(ipc.handlers.size).toBe(0)
  })
})
