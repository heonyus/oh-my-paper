import type { MarkdownImportCommitResult, ParsedMarkdownNode } from "../shared/interchangeTypes"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import type { CollectionService } from "./collectionService"
import {
  commitMarkdownMetadata,
  prepareMarkdownImport,
  runInSavepoint,
} from "./interchangeServicePersistence"

export async function commitCanonicalMarkdownNodes(
  collection: CollectionService,
  nodes: readonly ParsedMarkdownNode[],
): Promise<MarkdownImportCommitResult> {
  const repository = collection.repository
  const prepared = prepareMarkdownImport(repository, nodes)
  const createdNodes: KnowledgeNode[] = []
  for (const input of prepared.operations.nodesToCreate) {
    if (input.id && repository.getNode(input.id)) continue
    createdNodes.push(await collection.createNode(input))
  }
  runInSavepoint(repository, () => commitMarkdownMetadata(repository, prepared.operations))
  return { createdNodes, skippedNodeIds: prepared.skippedNodeIds }
}
