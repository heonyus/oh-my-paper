import { describe, expect, it } from "vitest"
import {
  GRAPH_WORLD,
  graphPositions,
} from "../../src/renderer/components/knowledge/NeighbourGraphSelectors"
import { knowledgeNodeSchema, knowledgeRelationSchema } from "../../src/shared/knowledgeSchemas"

const node = (id: string, kind: "concept" | "paper", title: string) =>
  knowledgeNodeSchema.parse({
    id,
    kind,
    title,
    body: "",
    aliases: [],
    metadata: {},
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  })

describe("NeighbourGraphSelectors", () => {
  it("keeps the root centered and places every visible node inside the bounded world", () => {
    const root = node("11111111-1111-4111-8111-111111111111", "concept", "Root")
    const neighbour = node("22222222-2222-4222-8222-222222222222", "paper", "Paper")
    const relation = knowledgeRelationSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      sourceId: root.id,
      targetId: neighbour.id,
      predicate: "relates_to",
      provenance: { source: "user", model: null, extractorVersion: null },
      evidenceIds: [],
      reviewState: "accepted",
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    })
    const positions = graphPositions(
      {
        rootNode: root,
        depth: 1,
        nodes: [root, neighbour],
        relations: [relation],
        evidenceAnchors: [],
      },
      [root, neighbour],
    )
    const rootPosition = positions.get(root.id)
    const neighbourPosition = positions.get(neighbour.id)

    expect(rootPosition).toEqual({ x: GRAPH_WORLD.width / 2, y: GRAPH_WORLD.height / 2 })
    expect(neighbourPosition?.x).toBeGreaterThan(0)
    expect(neighbourPosition?.x).toBeLessThan(GRAPH_WORLD.width)
    expect(neighbourPosition?.y).toBeGreaterThan(0)
    expect(neighbourPosition?.y).toBeLessThan(GRAPH_WORLD.height)
  })
})
