import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { openKnowledgeDatabase } from "../../src/electron/knowledgeDatabase"
import { commitProposals, proposalContext } from "../../src/electron/knowledgeProposals"
import { KnowledgeRepository } from "../../src/electron/knowledgeRepository"
import { linkKnowledgeEvidence } from "../../src/electron/linkKnowledgeEvidence"
import { linkEvidenceInputSchema } from "../../src/shared/knowledgeActions"
import { documentVersionRecordSchema } from "../../src/shared/knowledgeSchemas"

describe("atomic source linking and bounded AI proposals", () => {
  it("rolls back partial links and rejects fabricated AI IDs before writing", async () => {
    const db = openKnowledgeDatabase(":memory:")
    const repo = new KnowledgeRepository(db)
    try {
      const paper = repo.createNode({ kind: "paper", title: "Synthetic source" })
      const version = repo.createDocumentVersion(
        documentVersionRecordSchema.parse({
          id: randomUUID(),
          originalDocumentId: "a".repeat(16),
          paperNodeId: paper.id,
          hash: "a".repeat(64),
          metadata: { pageCount: 2 },
          createdAt: new Date().toISOString(),
        }),
      )
      const input = {
        documentId: version.originalDocumentId,
        hash: version.hash,
        anchor: { page: 3, quote: "Synthetic evidence" },
        target: { type: "new", kind: "concept", title: "Should not remain" },
      }
      await expect(
        linkKnowledgeEvidence(repo, linkEvidenceInputSchema.parse(input)),
      ).rejects.toThrow()
      expect(repo.findNodes({ kind: "concept" })).toHaveLength(0)
      const concept = await linkKnowledgeEvidence(
        repo,
        linkEvidenceInputSchema.parse({
          ...input,
          anchor: { page: 2, quote: "Synthetic evidence" },
        }),
      )
      expect(concept.body).toBe("")
      const scope = proposalContext(repo, [paper.id, concept.id])
      const anchor = scope.evidence[0]
      if (!anchor) throw new Error("missing anchor")
      const proposed = {
        sourceId: paper.id,
        targetId: concept.id,
        predicate: "relates_to",
        evidenceIds: [anchor.id],
      }
      const count = repo.findRelations().length
      expect(() =>
        commitProposals(
          repo,
          scope,
          JSON.stringify({ relations: [proposed, { ...proposed, targetId: randomUUID() }] }),
          "synthetic-model",
        ),
      ).toThrow()
      expect(repo.findRelations()).toHaveLength(count)
      const results = commitProposals(
        repo,
        scope,
        JSON.stringify({ relations: [proposed] }),
        "synthetic-model",
      )
      expect(results[0]).toMatchObject({
        reviewState: "proposed",
        provenance: { source: "ai", model: "synthetic-model" },
      })
      repo.updateNode({ id: concept.id, title: "changed while generating" })
      expect(() =>
        commitProposals(repo, scope, JSON.stringify({ relations: [proposed] }), "synthetic-model"),
      ).toThrow(/변경/)
    } finally {
      db.close()
    }
  })
})
