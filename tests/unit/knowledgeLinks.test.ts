import { describe, expect, it } from "vitest"
import {
  extractWikiLinks,
  findLinkCompletions,
  resolveWikiLinks,
} from "../../src/renderer/lib/knowledgeLinks"
import { knowledgeNodeIdSchema, knowledgeNodeSchema } from "../../src/shared/knowledgeSchemas"

describe("knowledgeLinks", () => {
  const nodeA = knowledgeNodeSchema.parse({
    id: knowledgeNodeIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    kind: "concept",
    title: "Self-Attention",
    body: "Computes weighted attention across tokens.",
    aliases: ["Dot-Product Attention"],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const nodeB = knowledgeNodeSchema.parse({
    id: knowledgeNodeIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    kind: "paper",
    title: "Attention Is All You Need",
    body: "Introduced the Transformer architecture.",
    aliases: ["Vaswani 2017"],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const allNodes = [nodeA, nodeB]

  it("extracts wikilinks from text", () => {
    const text = "Here is a mention of [[Self-Attention]] and [[Vaswani 2017]]."
    const links = extractWikiLinks(text)
    expect(links).toEqual(["Self-Attention", "Vaswani 2017"])
  })

  it("resolves wikilinks by title and alias without breaking when renamed", () => {
    const text = "Link to [[Self-Attention]] and alias [[Vaswani 2017]] and [[Missing Node]]."
    const resolved = resolveWikiLinks(text, allNodes)

    expect(resolved).toHaveLength(3)
    expect(resolved[0]?.targetNode?.id).toBe(nodeA.id)
    expect(resolved[1]?.targetNode?.id).toBe(nodeB.id)
    expect(resolved[2]?.targetNode).toBeNull()
  })

  it("resolves canonical ids and preserves a display label", () => {
    const resolved = resolveWikiLinks(`[[${nodeA.id}|Attention mechanism]]`, allNodes)

    expect(resolved[0]?.targetId).toBe(nodeA.id)
    expect(resolved[0]?.label).toBe("Attention mechanism")
    expect(resolved[0]?.status).toBe("resolved")
  })

  it("marks duplicate legacy titles as ambiguous", () => {
    const duplicate = knowledgeNodeSchema.parse({
      ...nodeB,
      id: knowledgeNodeIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      title: nodeA.title,
    })
    const resolved = resolveWikiLinks("[[Self-Attention]]", [nodeA, duplicate])

    expect(resolved[0]?.targetNode).toBeNull()
    expect(resolved[0]?.status).toBe("ambiguous")
  })

  it("suggests link completions from existing titles and aliases", () => {
    const suggestions = findLinkCompletions("atten", allNodes)
    expect(suggestions.map((s) => s.title)).toContain("Self-Attention")
    expect(suggestions.map((s) => s.title)).toContain("Attention Is All You Need")
  })
})
