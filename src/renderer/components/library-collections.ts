import type { BoardRecord, KnowledgeNodeId, PlacementRecord } from "../../shared/knowledgeSchemas"
import type { KnowledgeClientOps } from "../lib/knowledgeTypes"
import type { DocumentId, DocumentRecord } from "../types"

export type LibraryCollectionMember = {
  readonly placement: PlacementRecord
  readonly documentId: DocumentId | null
}

export type LibraryCollection = {
  readonly board: BoardRecord
  readonly members: readonly LibraryCollectionMember[]
  readonly paperNodeIds: Readonly<Record<string, KnowledgeNodeId>>
  readonly lookupFailures: readonly DocumentId[]
  readonly placementLoadFailed: boolean
}

const DOCUMENT_LOOKUP_BATCH_SIZE = 16

export async function loadLibraryCollections(
  clientOps: KnowledgeClientOps,
  documents: readonly DocumentRecord[],
): Promise<readonly LibraryCollection[]> {
  const nodeEntries: (readonly [DocumentId, KnowledgeNodeId] | null)[] = []
  const lookupFailures: DocumentId[] = []
  for (let index = 0; index < documents.length; index += DOCUMENT_LOOKUP_BATCH_SIZE) {
    const batch = documents.slice(index, index + DOCUMENT_LOOKUP_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (document) => {
        try {
          const version = (await clientOps.getDocVersionsByHash(document.hash))[0]
          return {
            entry: version ? ([document.id, version.paperNodeId] as const) : null,
            failed: null,
          }
        } catch {
          return { entry: null, failed: document.id }
        }
      }),
    )
    for (const result of results) {
      nodeEntries.push(result.entry)
      if (result.failed) lookupFailures.push(result.failed)
    }
  }
  const validEntries = nodeEntries.filter(
    (entry): entry is readonly [DocumentId, KnowledgeNodeId] => entry !== null,
  )
  const paperNodeIds = Object.fromEntries(validEntries)
  const documentByNodeId = new Map(
    validEntries.map(([documentId, nodeId]) => [nodeId, documentId] as const),
  )
  const boards = await clientOps.listBoards()
  const collections: LibraryCollection[] = []
  for (const board of boards) {
    let placements: Awaited<ReturnType<KnowledgeClientOps["findPlacementsForBoard"]>> = []
    let placementLoadFailed = false
    try {
      placements = await clientOps.findPlacementsForBoard(board.id)
    } catch {
      placementLoadFailed = true
    }
    collections.push({
      board,
      paperNodeIds,
      lookupFailures,
      placementLoadFailed,
      members: placements.map((placement) => ({
        placement,
        documentId: documentByNodeId.get(placement.nodeId) ?? null,
      })),
    })
  }
  return collections
}

export function collectionDocumentIds(
  collection: LibraryCollection | undefined,
): ReadonlySet<DocumentId> {
  return new Set(
    collection?.members.flatMap((member) => (member.documentId ? [member.documentId] : [])) ?? [],
  )
}
