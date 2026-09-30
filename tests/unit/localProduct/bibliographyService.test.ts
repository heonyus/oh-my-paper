// @vitest-environment node
import { describe, expect, it } from "vitest"
import { BibliographyService } from "../../../src/electron/bibliographyService"
import { knowledgeNodeIdSchema, knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"
import type {
  KnowledgeNode,
  KnowledgeNodeId,
  NodeFilter,
  UpdateNodeInput,
} from "../../../src/shared/knowledgeTypes"

const paperId = knowledgeNodeIdSchema.parse("11111111-1111-4111-8111-111111111111")
const duplicateId = knowledgeNodeIdSchema.parse("22222222-2222-4222-8222-222222222222")

function paper(
  id: string,
  title: string,
  metadata: Readonly<Record<string, unknown>>,
): KnowledgeNode {
  return knowledgeNodeSchema.parse({
    id,
    kind: "paper",
    title,
    body: "Reader-linked abstract",
    aliases: [],
    metadata,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
  })
}

class MemoryPaperRepository {
  private readonly nodes = new Map<KnowledgeNodeId, KnowledgeNode>()

  constructor(nodes: readonly KnowledgeNode[]) {
    for (const node of nodes) this.nodes.set(node.id, node)
  }

  getNode(id: KnowledgeNodeId): KnowledgeNode | null {
    return this.nodes.get(id) ?? null
  }

  findNodes(filter: NodeFilter = {}): readonly KnowledgeNode[] {
    const matching = [...this.nodes.values()].filter(
      (node) => filter.kind === undefined || node.kind === filter.kind,
    )
    return matching.slice(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 100))
  }

  updateNode(input: UpdateNodeInput): KnowledgeNode {
    const current = this.nodes.get(input.id)
    if (!current) throw new Error("missing test node")
    const updated = knowledgeNodeSchema.parse({
      ...current,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.aliases === undefined ? {} : { aliases: input.aliases }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      updatedAt: "2026-09-06T01:00:00.000Z",
    })
    this.nodes.set(updated.id, updated)
    return updated
  }
}

describe("BibliographyService", () => {
  it("updates metadata without replacing reader identity and keeps its citation key stable", () => {
    // Given
    const repository = new MemoryPaperRepository([
      paper(paperId, "Old title", {
        custom: "keep",
        documentVersionId: "version-stays",
        sourceAnchorIds: ["anchor-stays"],
      }),
    ])
    const service = new BibliographyService(repository)

    // When
    const first = service.updatePaper({
      paperNodeId: paperId,
      title: "Retrieval Systems",
      authors: ["Minji Park"],
      year: 2024,
      doi: "https://doi.org/10.1000/Example",
      arxivId: null,
      venue: "Clinical AI",
      tags: ["evidence"],
      readingState: "reading",
    })
    const second = service.updatePaper({
      paperNodeId: paperId,
      title: "Retrieval Systems, revised",
      authors: ["Minji Park"],
      year: 2025,
      doi: "10.1000/example",
      arxivId: null,
      venue: "Clinical AI",
      tags: ["evidence"],
      readingState: "read",
    })

    // Then
    expect(first.metadata.citationKey).toBe("park2024retrieval")
    expect(second.metadata.citationKey).toBe(first.metadata.citationKey)
    expect(second.node.body).toBe("Reader-linked abstract")
    expect(second.node.metadata).toMatchObject({
      custom: "keep",
      documentVersionId: "version-stays",
      sourceAnchorIds: ["anchor-stays"],
    })
    expect(second.node.aliases).toContain("doi:10.1000/example")
  })

  it("previews exact identifier duplicates without merging them", () => {
    // Given
    const repository = new MemoryPaperRepository([
      paper(paperId, "Current", { doi: "10.1000/shared" }),
      paper(duplicateId, "Existing", { doi: "10.1000/shared" }),
    ])
    const service = new BibliographyService(repository)

    // When
    const preview = service.previewDuplicates({
      paperNodeId: paperId,
      doi: "10.1000/shared",
      arxivId: null,
    })

    // Then
    expect(preview.candidates).toEqual([
      expect.objectContaining({ paperNodeId: duplicateId, reasons: ["doi"] }),
    ])
    expect(repository.findNodes()).toHaveLength(2)
  })

  it("keeps a new citation key unique beyond the first repository page", () => {
    // Given
    const existing = Array.from({ length: 101 }, (_, index) =>
      paper(
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        `Existing ${index}`,
        index === 100 ? { citationKey: "park2024retrieval" } : {},
      ),
    )
    const service = new BibliographyService(
      new MemoryPaperRepository([paper(paperId, "Draft", {}), ...existing]),
    )

    // When
    const updated = service.updatePaper({
      paperNodeId: paperId,
      title: "Retrieval Systems",
      authors: ["Minji Park"],
      year: 2024,
      doi: null,
      arxivId: null,
      venue: "",
      tags: [],
      readingState: "unread",
    })

    // Then
    expect(updated.metadata.citationKey).toBe("park2024retrieval111111")
  })

  it("exports selected papers as local BibTeX", () => {
    // Given
    const repository = new MemoryPaperRepository([
      paper(paperId, "Evidence {Agents}", {
        authors: ["Minji Park", "Jane Kim"],
        year: 2026,
        venue: "Clinical AI",
        doi: "10.1000/example",
        citationKey: "park2026evidence",
        readingState: "read",
      }),
    ])
    const service = new BibliographyService(repository)

    // When
    const exported = service.exportBibtex({ paperNodeIds: [paperId] })

    // Then
    expect(exported.fileName).toBe("references.bib")
    expect(exported.content).toContain("@article{park2026evidence,")
    expect(exported.content).toContain("author = {Minji Park and Jane Kim}")
    expect(exported.content).toContain("title = {Evidence \\{Agents\\}}")
  })
})
