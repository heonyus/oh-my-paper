import type { LinkEvidenceInput } from "../shared/knowledgeActions"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import type { CollectionService } from "./collectionService"
import { withKnowledgeSavepoint } from "./knowledgeDatabaseTransaction"
import type { KnowledgeRepository } from "./knowledgeRepository"

function assertNever(value: never): never {
  throw new Error(`Unsupported evidence target: ${JSON.stringify(value)}`)
}

function attachEvidence(
  repo: KnowledgeRepository,
  input: LinkEvidenceInput,
  node: KnowledgeNode,
): KnowledgeNode {
  const version = repo
    .findDocumentVersionsByHash(input.hash)
    .find((candidate) => candidate.originalDocumentId === input.documentId)
  if (!version) throw new Error("이 PDF 버전의 원문 기록을 찾을 수 없습니다.")
  const anchor = repo.createEvidenceAnchor({ ...input.anchor, documentVersionId: version.id })
  repo.createRelation({
    sourceId: version.paperNodeId,
    sourceEndpoint: { kind: "pdf-fragment", anchorId: anchor.id },
    targetId: node.id,
    predicate: "discusses",
    evidenceIds: [anchor.id],
    reviewState: "accepted",
    provenance: { source: "user", model: null, extractorVersion: null },
  })
  return node
}

function linkRepositoryEvidence(
  repo: KnowledgeRepository,
  input: LinkEvidenceInput,
): KnowledgeNode {
  return withKnowledgeSavepoint(repo.db, () => {
    switch (input.target.type) {
      case "existing": {
        const node = repo.getNode(input.target.nodeId)
        if (!node) throw new Error("연결할 지식이 삭제되었습니다.")
        return attachEvidence(repo, input, node)
      }
      case "new":
        return attachEvidence(
          repo,
          input,
          repo.createNode({ kind: input.target.kind, title: input.target.title }),
        )
      default:
        return assertNever(input.target)
    }
  })
}

export async function linkKnowledgeEvidence(
  repo: KnowledgeRepository,
  input: LinkEvidenceInput,
  collectionService?: CollectionService,
): Promise<KnowledgeNode> {
  switch (input.target.type) {
    case "existing":
      return linkRepositoryEvidence(repo, input)
    case "new": {
      if (input.target.kind !== "note" || !collectionService) {
        return linkRepositoryEvidence(repo, input)
      }
      const node = await collectionService.createNode({
        kind: input.target.kind,
        title: input.target.title,
      })
      try {
        return withKnowledgeSavepoint(repo.db, () => attachEvidence(repo, input, node))
      } catch (error) {
        await collectionService.deleteNode(node.id)
        throw error
      }
    }
    default:
      return assertNever(input.target)
  }
}
