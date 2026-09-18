import { randomUUID } from "node:crypto"
import type { MarkdownImportCommitResult, ParsedMarkdownNode } from "../shared/interchangeTypes"
import type {
  DocumentVersionRecord,
  EvidenceAnchor,
  KnowledgeNode,
  KnowledgeNodeId,
} from "../shared/knowledgeSchemas"
import { evidenceAnchorIdSchema } from "../shared/knowledgeSchemas"
import type { CreateRelationInput } from "../shared/knowledgeTypes"
import { serializeMarkdownNode } from "./interchangeMarkdown"
import { buildMarkdownImportOperations } from "./interchangeMarkdownImport"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { anchorRowSchema, docVersionRowSchema, rowToDocVersion } from "./knowledgeRepositoryRows"

export function runInSavepoint<T>(repository: KnowledgeRepository, fn: () => T): T {
  const savepoint = `sp_ic_${randomUUID().replace(/-/g, "")}`
  repository.db.exec(`SAVEPOINT ${savepoint}`)
  try {
    const result = fn()
    repository.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
    return result
  } catch (error) {
    repository.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    repository.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
    throw error
  }
}

export function exportMarkdownNode(
  repository: KnowledgeRepository,
  nodeId: KnowledgeNodeId,
): string {
  const node = repository.getNode(nodeId)
  if (!node) throw new Error(`Node not found: ${nodeId}`)

  const relations = repository.findRelations({ nodeId })
  const anchors = new Map<string, EvidenceAnchor>()
  for (const relation of relations) {
    for (const evidenceId of relation.evidenceIds) {
      const anchor = repository.getEvidenceAnchor(evidenceId)
      if (anchor) anchors.set(anchor.id, anchor)
    }
  }

  const versions = new Map<string, DocumentVersionRecord>()
  const versionRows = repository.db
    .prepare("SELECT * FROM document_versions WHERE paper_node_id = ?")
    .all(nodeId)
  for (const rawVersion of versionRows) {
    const version = rowToDocVersion(docVersionRowSchema.parse(rawVersion))
    versions.set(version.id, version)
    const anchorRows = repository.db
      .prepare("SELECT * FROM evidence_anchors WHERE document_version_id = ?")
      .all(version.id)
    for (const rawAnchor of anchorRows) {
      const anchorRow = anchorRowSchema.parse(rawAnchor)
      const anchor = repository.getEvidenceAnchor(evidenceAnchorIdSchema.parse(anchorRow.id))
      if (anchor) anchors.set(anchor.id, anchor)
    }
  }
  for (const anchor of anchors.values()) {
    const version = repository.getDocumentVersion(anchor.documentVersionId)
    if (version) versions.set(version.id, version)
  }

  return serializeMarkdownNode(node, [...anchors.values()], relations, [...versions.values()])
}

function recordsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateNodeDependencies(
  repository: KnowledgeRepository,
  nodes: readonly ParsedMarkdownNode[],
  nodeIds: ReadonlySet<KnowledgeNodeId>,
): void {
  const operations = buildMarkdownImportOperations(nodes)
  const versionIds = new Set(operations.documentVersionsToCreate.map((version) => version.id))
  const anchorIds = new Set(operations.anchorsToCreate.map((anchor) => anchor.id))
  const relationRecords = new Map<string, CreateRelationInput>()

  for (const version of operations.documentVersionsToCreate) {
    const existing = repository.getDocumentVersion(version.id)
    if (existing && !recordsEqual(existing, version)) {
      throw new Error(`Conflict detected for document version ${version.id}`)
    }
    if (
      !existing &&
      !nodeIds.has(version.paperNodeId) &&
      !repository.getNode(version.paperNodeId)
    ) {
      throw new Error(`Missing dependency: paper node ${version.paperNodeId}`)
    }
  }

  for (const anchor of operations.anchorsToCreate) {
    const anchorId = anchor.id
    if (!anchorId) throw new Error("Imported evidence anchor is missing a stable ID")
    const existing = repository.getEvidenceAnchor(anchorId)
    const comparable = {
      id: anchorId,
      documentVersionId: anchor.documentVersionId,
      page: anchor.page,
      quote: anchor.quote,
      x: anchor.x ?? 0,
      y: anchor.y ?? 0,
      fragments: anchor.fragments ?? [],
      ...(anchor.astRanges ? { astRanges: anchor.astRanges } : {}),
    }
    if (
      existing &&
      !recordsEqual(
        {
          id: existing.id,
          documentVersionId: existing.documentVersionId,
          page: existing.page,
          quote: existing.quote,
          x: existing.x,
          y: existing.y,
          fragments: existing.fragments,
          ...(existing.astRanges ? { astRanges: existing.astRanges } : {}),
        },
        comparable,
      )
    ) {
      throw new Error(`Conflict detected for evidence anchor ${anchorId}`)
    }
    if (
      !existing &&
      !versionIds.has(anchor.documentVersionId) &&
      !repository.getDocumentVersion(anchor.documentVersionId)
    ) {
      throw new Error(`Missing dependency: document version ${anchor.documentVersionId}`)
    }
  }

  for (const relation of operations.relationsToCreate) {
    if (!nodeIds.has(relation.sourceId) && !repository.getNode(relation.sourceId)) {
      throw new Error(`Missing dependency: referenced node ${relation.sourceId}`)
    }
    if (!nodeIds.has(relation.targetId) && !repository.getNode(relation.targetId)) {
      throw new Error(`Missing dependency: referenced node ${relation.targetId}`)
    }
    for (const evidenceId of relation.evidenceIds ?? []) {
      if (!anchorIds.has(evidenceId) && !repository.getEvidenceAnchor(evidenceId)) {
        throw new Error(`Missing dependency: evidence anchor ${evidenceId}`)
      }
    }
    if (relation.id) {
      const previous = relationRecords.get(relation.id)
      if (previous && !recordsEqual(previous, relation)) {
        throw new Error(`Conflict detected for relation ${relation.id}`)
      }
      relationRecords.set(relation.id, relation)
      const existing = repository.getRelation(relation.id)
      if (existing) {
        const comparable = {
          id: existing.id,
          sourceId: existing.sourceId,
          targetId: existing.targetId,
          predicate: existing.predicate,
          provenance: existing.provenance,
          evidenceIds: existing.evidenceIds,
          reviewState: existing.reviewState,
        }
        if (!recordsEqual(comparable, relation)) {
          throw new Error(`Conflict detected for relation ${relation.id}`)
        }
      }
    }
  }
}

function classifyMarkdownNodes(
  repository: KnowledgeRepository,
  nodes: readonly ParsedMarkdownNode[],
): {
  readonly toCreate: readonly ParsedMarkdownNode[]
  readonly skipped: readonly KnowledgeNodeId[]
} {
  const seen = new Set<KnowledgeNodeId>()
  const toCreate: ParsedMarkdownNode[] = []
  const skipped: KnowledgeNodeId[] = []
  for (const parsed of nodes) {
    const id = parsed.frontMatter.id
    if (seen.has(id)) throw new Error(`Duplicate node ID in import batch: ${id}`)
    seen.add(id)
    const existing = repository.getNode(id)
    if (!existing) {
      toCreate.push(parsed)
      continue
    }
    const imported: Pick<KnowledgeNode, "kind" | "title" | "body" | "aliases" | "metadata"> = {
      kind: parsed.frontMatter.kind,
      title: parsed.frontMatter.title,
      body: parsed.body,
      aliases: parsed.frontMatter.aliases,
      metadata: parsed.frontMatter.metadata,
    }
    const current = {
      kind: existing.kind,
      title: existing.title,
      body: existing.body,
      aliases: existing.aliases,
      metadata: existing.metadata,
    }
    if (!recordsEqual(current, imported)) {
      throw new Error(
        `Conflict detected for node ${id}: cannot overwrite without explicit decision`,
      )
    }
    skipped.push(id)
  }
  return { toCreate, skipped }
}

export function prepareMarkdownImport(
  repository: KnowledgeRepository,
  nodes: readonly ParsedMarkdownNode[],
) {
  const classified = classifyMarkdownNodes(repository, nodes)
  const operations = buildMarkdownImportOperations(nodes)
  validateNodeDependencies(repository, nodes, new Set(nodes.map((node) => node.frontMatter.id)))
  return { operations, skippedNodeIds: classified.skipped }
}

export function commitMarkdownMetadata(
  repository: KnowledgeRepository,
  operations: ReturnType<typeof buildMarkdownImportOperations>,
): void {
  for (const version of operations.documentVersionsToCreate) {
    if (!repository.getDocumentVersion(version.id)) repository.createDocumentVersion(version)
  }
  for (const anchor of operations.anchorsToCreate) {
    if (!anchor.id || repository.getEvidenceAnchor(anchor.id)) continue
    repository.createEvidenceAnchor(anchor)
  }
  for (const relation of operations.relationsToCreate) {
    if (relation.id && repository.getRelation(relation.id)) continue
    repository.createRelation(relation)
  }
}

export function commitMarkdownNodes(
  repository: KnowledgeRepository,
  nodes: readonly ParsedMarkdownNode[],
): MarkdownImportCommitResult {
  const prepared = prepareMarkdownImport(repository, nodes)

  return runInSavepoint(repository, () => {
    const createdNodes: KnowledgeNode[] = []
    for (const input of prepared.operations.nodesToCreate) {
      if (input.id && repository.getNode(input.id)) continue
      createdNodes.push(repository.createNode(input))
    }
    commitMarkdownMetadata(repository, prepared.operations)
    return { createdNodes, skippedNodeIds: prepared.skippedNodeIds }
  })
}
