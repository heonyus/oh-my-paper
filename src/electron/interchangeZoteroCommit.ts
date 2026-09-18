import type {
  ZoteroCommitOptions,
  ZoteroCommitResult,
  ZoteroImportItemPreview,
} from "../shared/interchangeTypes"
import type { KnowledgeNodeId } from "../shared/knowledgeSchemas"
import type { KnowledgeRepository } from "./knowledgeRepository"

export function commitZoteroItems(
  repository: KnowledgeRepository,
  items: readonly ZoteroImportItemPreview[],
  options?: ZoteroCommitOptions,
): ZoteroCommitResult {
  const createdNodeIds: KnowledgeNodeId[] = []
  const mappedExternalIds: string[] = []
  const skippedItemKeys: string[] = []
  const approvedMergeExternalIds = new Set(options?.approvedMergeExternalIds ?? [])
  const approvedMergeItemKeys = new Set(options?.approvedMergeItemKeys ?? [])
  const seenExternalIds = new Set<string>()
  const itemKeyCounts = new Map<string, number>()
  for (const item of items) {
    const fullExternalId = `${item.libraryKey}:${item.itemKey}`
    if (seenExternalIds.has(fullExternalId)) {
      throw new Error(`Duplicate Zotero mapping in import batch: ${fullExternalId}`)
    }
    seenExternalIds.add(fullExternalId)
    itemKeyCounts.set(item.itemKey, (itemKeyCounts.get(item.itemKey) ?? 0) + 1)
  }
  seenExternalIds.clear()

  for (const item of items) {
    const fullExternalId = `${item.libraryKey}:${item.itemKey}`
    if (seenExternalIds.has(fullExternalId)) {
      throw new Error(`Duplicate Zotero mapping in import batch: ${fullExternalId}`)
    }
    seenExternalIds.add(fullExternalId)

    // Dedup: re-query canonical mappings directly from repository at commit time
    const currentMapping = repository.getExternalMapping("zotero", fullExternalId)
    if (currentMapping) {
      skippedItemKeys.push(item.itemKey)
      continue
    }

    // DOI merge with explicit approval only
    if (
      item.matchType === "doi_match" &&
      item.proposedMergeNodeId &&
      (approvedMergeExternalIds.has(fullExternalId) ||
        (itemKeyCounts.get(item.itemKey) === 1 && approvedMergeItemKeys.has(item.itemKey)))
    ) {
      repository.createExternalMapping({
        nodeId: item.proposedMergeNodeId,
        system: "zotero",
        externalId: fullExternalId,
        isFullTextReviewed: false,
        metadata: {
          libraryKey: item.libraryKey,
          itemKey: item.itemKey,
          itemType: item.itemType,
          mergedByDoi: true,
          ...(item.doi ? { doi: item.doi } : {}),
          ...(item.libraryType !== undefined ? { libraryType: item.libraryType } : {}),
          ...(item.libraryId !== undefined ? { libraryId: item.libraryId } : {}),
        },
      })
      mappedExternalIds.push(fullExternalId)
      continue
    }

    const node = repository.createNode({
      kind: "paper",
      title: item.title,
      body: item.abstractNote,
      aliases: item.doi ? [`DOI:${item.doi}`] : [],
      metadata: {
        isFullTextReviewed: false,
        source: "zotero",
        itemType: item.itemType,
        creators: item.creators,
        date: item.date,
        ...(item.doi ? { doi: item.doi } : {}),
      },
    })

    createdNodeIds.push(node.id)

    repository.createExternalMapping({
      nodeId: node.id,
      system: "zotero",
      externalId: fullExternalId,
      isFullTextReviewed: false,
      metadata: {
        libraryKey: item.libraryKey,
        itemKey: item.itemKey,
        itemType: item.itemType,
        ...(item.doi ? { doi: item.doi } : {}),
        ...(item.libraryType !== undefined ? { libraryType: item.libraryType } : {}),
        ...(item.libraryId !== undefined ? { libraryId: item.libraryId } : {}),
      },
    })

    mappedExternalIds.push(fullExternalId)
  }

  return {
    createdNodeIds,
    mappedExternalIds,
    skippedItemKeys,
  }
}
