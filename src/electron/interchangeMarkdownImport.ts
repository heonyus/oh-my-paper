import type {
  MarkdownConflict,
  MarkdownImportPreview,
  ParsedMarkdownNode,
} from "../shared/interchangeTypes"
import type {
  CreateEvidenceAnchorInput,
  CreateNodeInput,
  CreateRelationInput,
  DocumentVersionRecord,
  KnowledgeNode,
  KnowledgeNodeId,
} from "../shared/knowledgeTypes"
import { parseMarkdownNode } from "./interchangeMarkdown"

export type ExistingNodeResolver =
  | readonly KnowledgeNode[]
  | ((id: KnowledgeNodeId) => KnowledgeNode | null)

export function previewMarkdownImport(
  files: readonly string[],
  existingNodes: ExistingNodeResolver,
): MarkdownImportPreview {
  const existingMap = new Map<KnowledgeNodeId, KnowledgeNode>()
  const isFunction = typeof existingNodes === "function"
  if (!isFunction) {
    for (const n of existingNodes) {
      existingMap.set(n.id, n)
    }
  }

  const getNode = (id: KnowledgeNodeId): KnowledgeNode | null => {
    if (isFunction) {
      return existingNodes(id)
    }
    return existingMap.get(id) ?? null
  }

  const parsedNodes: ParsedMarkdownNode[] = []
  const parseErrors: { fileIndex: number; error: string }[] = []
  const seenBatchIds = new Set<KnowledgeNodeId>()
  const duplicateIdsInBatch: KnowledgeNodeId[] = []

  for (let i = 0; i < files.length; i++) {
    const fileContent = files[i]
    if (fileContent === undefined) {
      continue
    }
    try {
      const parsed = parseMarkdownNode(fileContent)
      parsedNodes.push(parsed)
      if (seenBatchIds.has(parsed.frontMatter.id)) {
        duplicateIdsInBatch.push(parsed.frontMatter.id)
      } else {
        seenBatchIds.add(parsed.frontMatter.id)
      }
    } catch (err) {
      parseErrors.push({
        fileIndex: i,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const conflicts: MarkdownConflict[] = []
  const newNodes: ParsedMarkdownNode[] = []

  for (const parsed of parsedNodes) {
    const existing = getNode(parsed.frontMatter.id)
    if (existing) {
      const hasDifferentKind = existing.kind !== parsed.frontMatter.kind
      const hasDifferentBody = existing.body.trim() !== parsed.body.trim()
      conflicts.push({
        nodeId: existing.id,
        existingTitle: existing.title,
        importedTitle: parsed.frontMatter.title,
        hasDifferentKind,
        hasDifferentBody,
        existingAliases: existing.aliases,
        importedAliases: parsed.frontMatter.aliases,
      })
    } else {
      newNodes.push(parsed)
    }
  }

  const isValid = parseErrors.length === 0 && duplicateIdsInBatch.length === 0

  return {
    parsedNodes,
    conflicts,
    newNodes,
    parseErrors,
    duplicateIdsInBatch,
    isValid,
  }
}

export function buildMarkdownImportOperations(nodesToImport: readonly ParsedMarkdownNode[]): {
  readonly documentVersionsToCreate: readonly DocumentVersionRecord[]
  readonly nodesToCreate: readonly CreateNodeInput[]
  readonly anchorsToCreate: readonly CreateEvidenceAnchorInput[]
  readonly relationsToCreate: readonly CreateRelationInput[]
} {
  const documentVersionsToCreate: DocumentVersionRecord[] = []
  const nodesToCreate: CreateNodeInput[] = []
  const anchorsToCreate: CreateEvidenceAnchorInput[] = []
  const relationsToCreate: CreateRelationInput[] = []
  const seenVersions = new Set<string>()
  const seenAnchors = new Set<string>()

  for (const parsed of nodesToImport) {
    const fm = parsed.frontMatter
    nodesToCreate.push({
      id: fm.id,
      kind: fm.kind,
      title: fm.title,
      body: parsed.body,
      aliases: fm.aliases,
      metadata: fm.metadata,
    })

    if (fm.documentVersions) {
      for (const v of fm.documentVersions) {
        if (!seenVersions.has(v.id)) {
          seenVersions.add(v.id)
          documentVersionsToCreate.push(v)
        }
      }
    }

    for (const a of fm.evidenceAnchors) {
      if (!seenAnchors.has(a.id)) {
        seenAnchors.add(a.id)
        anchorsToCreate.push({
          id: a.id,
          documentVersionId: a.documentVersionId,
          page: a.page,
          quote: a.quote,
          x: a.x,
          y: a.y,
          fragments: a.fragments,
          ...(a.astRanges ? { astRanges: a.astRanges } : {}),
        })
      }
    }

    for (const rel of fm.outgoingRelations) {
      const sourceId = rel.sourceId ?? (rel.direction === "incoming" ? rel.targetId : fm.id)
      const targetId = rel.direction === "incoming" && !rel.sourceId ? fm.id : rel.targetId
      relationsToCreate.push({
        ...(rel.id ? { id: rel.id } : {}),
        sourceId,
        targetId,
        predicate: rel.predicate,
        provenance: rel.provenance,
        reviewState: rel.reviewState,
        evidenceIds: rel.evidenceIds ?? [],
      })
    }
  }

  return {
    documentVersionsToCreate,
    nodesToCreate,
    anchorsToCreate,
    relationsToCreate,
  }
}
