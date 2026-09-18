// @vitest-environment node
import { createHash, randomUUID } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { openKnowledgeDatabase } from "../../../src/electron/knowledgeDatabase"
import { KnowledgeRepository } from "../../../src/electron/knowledgeRepository"
import { captureNoteFragment } from "../../../src/renderer/lib/captureNoteFragment"
import { knowledgeEndpointSchema } from "../../../src/shared/fragmentAnchors"

const db = openKnowledgeDatabase(":memory:")
const repo = new KnowledgeRepository(db)
afterEach(() => db.exec("DELETE FROM knowledge_relations; DELETE FROM knowledge_nodes"))
const provenance = { source: "user", model: null, extractorVersion: null }

function pair() {
  const source = repo.createNode({ kind: "note", title: "Note", body: "A precise claim." })
  const target = repo.createNode({ kind: "concept", title: "Concept" })
  const endpoint = knowledgeEndpointSchema.parse({
    kind: "note-fragment",
    anchor: {
      id: randomUUID(),
      nodeId: source.id,
      blockId: null,
      revision: createHash("sha256").update(source.body).digest("hex"),
      quote: source.body,
      prefix: "",
      suffix: "",
      from: 0,
      to: source.body.length,
    },
  })
  return { source, target, endpoint }
}

describe("fragment relations", () => {
  it("creates a stable block marker without changing the selected source and reuses it", async () => {
    const { source } = pair()
    const captured = await captureNoteFragment(source.id, source.body, { from: 2, to: 9 })
    expect(captured.anchor.quote).toBe("precise")
    expect(captured.body.slice(captured.anchor.from, captured.anchor.to)).toBe("precise")
    const again = await captureNoteFragment(source.id, captured.body, captured.anchor)
    expect(again.body).toBe(captured.body)
    expect(again.anchor.blockId).toBe(captured.anchor.blockId)
  })

  it("rejects stale saving without overwriting the current note", () => {
    const { source } = pair()
    repo.updateNode({ id: source.id, body: "External edit" })
    expect(() =>
      repo.updateNode({ id: source.id, expectedBody: source.body, body: "Old buffer" }),
    ).toThrow(/변경/)
    expect(repo.getNode(source.id)?.body).toBe("External edit")
  })
  it("preserves exact endpoints through relation, backlinks, and graph reads", () => {
    const { source, target, endpoint } = pair()
    const input = {
      sourceId: source.id,
      targetId: target.id,
      predicate: "relates_to",
      provenance,
      sourceEndpoint: endpoint,
    }
    const relation = repo.createRelation({
      ...input,
      predicate: "relates_to",
      provenance: { ...provenance, source: "user" },
    })
    expect(repo.getRelation(relation.id)).toMatchObject({ sourceEndpoint: endpoint })
    expect(repo.getBacklinks(target.id)[0]?.relation).toMatchObject({ sourceEndpoint: endpoint })
    expect(repo.getNeighbourGraph(target.id).relations[0]).toMatchObject({
      sourceEndpoint: endpoint,
    })
  })

  it("rejects a fragment attributed to the wrong node", () => {
    const { source, target, endpoint } = pair()
    expect(() =>
      repo.createRelation({
        sourceId: target.id,
        targetId: source.id,
        predicate: "relates_to",
        provenance: { ...provenance, source: "user" },
        sourceEndpoint: endpoint,
      }),
    ).toThrow(/endpoint/i)
  })

  it("does not accept a stale edit as a fresh source selection", () => {
    const { source, target, endpoint } = pair()
    repo.updateNode({ id: source.id, body: "A changed claim." })
    expect(() =>
      repo.createRelation({
        sourceId: source.id,
        targetId: target.id,
        predicate: "relates_to",
        provenance: { ...provenance, source: "user" },
        sourceEndpoint: endpoint,
      }),
    ).toThrow(/stale/i)
  })
})
