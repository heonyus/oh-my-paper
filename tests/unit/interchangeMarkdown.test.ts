import { describe, expect, it } from "vitest"
import { parseMarkdownNode, serializeMarkdownNode } from "../../src/electron/interchangeMarkdown"
import {
  buildMarkdownImportOperations,
  previewMarkdownImport,
} from "../../src/electron/interchangeMarkdownImport"
import {
  documentVersionIdSchema,
  type EvidenceAnchor,
  evidenceAnchorIdSchema,
  type KnowledgeNode,
  type KnowledgeRelation,
  knowledgeNodeIdSchema,
  knowledgeRelationIdSchema,
} from "../../src/shared/knowledgeSchemas"

describe("Markdown Interchange Adapter", () => {
  const sampleNode: KnowledgeNode = {
    id: knowledgeNodeIdSchema.parse("a1111111-1111-4111-8111-111111111111"),
    kind: "concept",
    title: "Catastrophic Forgetting",
    body: "Tendency of neural networks to forget previously learned information upon learning new information.",
    aliases: ["CF", "Interference"],
    metadata: { domain: "continual-learning" },
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  }

  const sampleAnchor: EvidenceAnchor = {
    id: evidenceAnchorIdSchema.parse("b2222222-2222-4222-8222-222222222222"),
    documentVersionId: documentVersionIdSchema.parse("c3333333-3333-4333-8333-333333333333"),
    page: 2,
    quote: "Neural networks suffer from catastrophic forgetting when trained sequentially.",
    x: 10,
    y: 20,
    fragments: [{ x: 0, y: 0, width: 1, height: 1 }],
    createdAt: "2026-09-05T00:00:00.000Z",
  }

  const sampleRelation: KnowledgeRelation = {
    id: knowledgeRelationIdSchema.parse("d4444444-4444-4444-8444-444444444444"),
    sourceId: sampleNode.id,
    targetId: knowledgeNodeIdSchema.parse("e5555555-5555-4555-8555-555555555555"),
    predicate: "discusses",
    provenance: { source: "user", model: null, extractorVersion: null },
    evidenceIds: [sampleAnchor.id],
    reviewState: "accepted",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  }

  it("roundtrips node identity, metadata, evidence anchors, and outgoing relations", () => {
    const serialized = serializeMarkdownNode(sampleNode, [sampleAnchor], [sampleRelation])
    expect(serialized).toContain("---json")
    expect(serialized).toContain("scourgify-node-v1")
    expect(serialized).toContain("# Catastrophic Forgetting")

    const parsed = parseMarkdownNode(serialized)
    expect(parsed.frontMatter.id).toBe(sampleNode.id)
    expect(parsed.frontMatter.kind).toBe("concept")
    expect(parsed.frontMatter.title).toBe(sampleNode.title)
    expect(parsed.frontMatter.aliases).toEqual(["CF", "Interference"])
    expect(parsed.frontMatter.evidenceAnchors).toHaveLength(1)
    expect(parsed.frontMatter.evidenceAnchors[0]?.id).toBe(sampleAnchor.id)
    expect(parsed.frontMatter.outgoingRelations).toHaveLength(1)
    expect(parsed.frontMatter.outgoingRelations[0]?.targetId).toBe(sampleRelation.targetId)
    expect(parsed.body).toBe(sampleNode.body)
  })

  it("fails cleanly on malformed or missing front matter", () => {
    expect(() => parseMarkdownNode("Just plain text without delimiter")).toThrow(
      "Missing front matter delimiter",
    )
    expect(() => parseMarkdownNode("---\ninvalid json\n---")).toThrow(
      "Front matter JSON parsing failed",
    )
    expect(() => parseMarkdownNode('---\n{"format": "wrong"}\n---')).toThrow(
      "Front matter validation failed",
    )
  })

  it("previews conflicts when imported node ID already exists with different content", () => {
    const serialized = serializeMarkdownNode(
      {
        ...sampleNode,
        title: "Updated CF Title",
        body: "Different body content",
      },
      [],
      [],
    )

    const preview = previewMarkdownImport([serialized], [sampleNode])
    expect(preview.isValid).toBe(true)
    expect(preview.newNodes).toHaveLength(0)
    expect(preview.conflicts).toHaveLength(1)
    const conflict = preview.conflicts[0]
    expect(conflict).toBeDefined()
    expect(conflict?.nodeId).toBe(sampleNode.id)
    expect(conflict?.existingTitle).toBe("Catastrophic Forgetting")
    expect(conflict?.importedTitle).toBe("Updated CF Title")
    expect(conflict?.hasDifferentBody).toBe(true)
  })

  it("detects duplicate node IDs within the import batch", () => {
    const serialized = serializeMarkdownNode(sampleNode, [], [])
    const preview = previewMarkdownImport([serialized, serialized], [])
    expect(preview.isValid).toBe(false)
    expect(preview.duplicateIdsInBatch).toContain(sampleNode.id)
  })

  it("builds import operations faithfully", () => {
    const serialized = serializeMarkdownNode(sampleNode, [sampleAnchor], [sampleRelation])
    const parsed = parseMarkdownNode(serialized)
    const ops = buildMarkdownImportOperations([parsed])

    expect(ops.nodesToCreate).toHaveLength(1)
    expect(ops.nodesToCreate[0]?.id).toBe(sampleNode.id)
    expect(ops.anchorsToCreate).toHaveLength(1)
    expect(ops.anchorsToCreate[0]?.id).toBe(sampleAnchor.id)
    expect(ops.relationsToCreate).toHaveLength(1)
    expect(ops.relationsToCreate[0]?.sourceId).toBe(sampleNode.id)
  })
})
