import type { ExperimentRecordV1 } from "../shared/interchangeSchemas"
import type { ExperimentCommitOptions, ExperimentCommitResult } from "../shared/interchangeTypes"
import type { KnowledgeNode, KnowledgeRelation, PlacementRecord } from "../shared/knowledgeSchemas"
import type { KnowledgeRepository } from "./knowledgeRepository"

export function commitExperimentRecords(
  repository: KnowledgeRepository,
  records: readonly ExperimentRecordV1[],
  options?: ExperimentCommitOptions,
): ExperimentCommitResult {
  if (options?.hypothesisNodeId) {
    const hypNode = repository.getNode(options.hypothesisNodeId)
    if (!hypNode) {
      throw new Error(`Hypothesis node not found: ${options.hypothesisNodeId}`)
    }
  }

  if (options?.targetBoardId) {
    const targetBoard = repository.getBoard(options.targetBoardId)
    if (!targetBoard) {
      throw new Error(`Target board not found: ${options.targetBoardId}`)
    }
  }

  const createdNodes: KnowledgeNode[] = []
  const mappedRunIds: string[] = []
  const createdRelations: KnowledgeRelation[] = []
  const createdPlacements: PlacementRecord[] = []
  const seenRunIds = new Set<string>()

  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx]
    if (!rec) continue
    if (seenRunIds.has(rec.runId)) {
      throw new Error(`Duplicate run ID in import batch: ${rec.runId}`)
    }
    seenRunIds.add(rec.runId)

    const existingMapping = repository.getExternalMapping("experiment", rec.runId)
    if (existingMapping) {
      // Idempotent skip if run is already mapped
      mappedRunIds.push(rec.runId)
      continue
    }

    const node = repository.createNode({
      kind: "experiment",
      title: rec.title,
      body: `Task: ${rec.task}\nModel: ${rec.model}\nStatus: ${rec.status}`,
      aliases: [`run:${rec.runId}`],
      metadata: {
        runId: rec.runId,
        task: rec.task,
        model: rec.model,
        status: rec.status,
        codeCommit: rec.codeCommit,
        aggregateConfig: rec.aggregateConfig,
        aggregateMetrics: rec.aggregateMetrics,
        failureCategories: rec.failureCategories,
        startedAt: rec.startedAt,
        completedAt: rec.completedAt,
      },
    })
    createdNodes.push(node)

    repository.createExternalMapping({
      nodeId: node.id,
      system: "experiment",
      externalId: rec.runId,
      isFullTextReviewed: false,
      metadata: {
        task: rec.task,
        model: rec.model,
        status: rec.status,
      },
    })
    mappedRunIds.push(rec.runId)

    if (options?.hypothesisNodeId) {
      const rel = repository.createRelation({
        sourceId: node.id,
        targetId: options.hypothesisNodeId,
        predicate: "tests",
        reviewState: "accepted",
        provenance: { source: "import", model: null, extractorVersion: "1.0" },
        evidenceIds: [],
      })
      createdRelations.push(rel)
    }

    if (options?.targetBoardId) {
      const placement = repository.createPlacement({
        boardId: options.targetBoardId,
        nodeId: node.id,
        x: 100 + idx * 40,
        y: 100 + idx * 40,
        width: 320,
        height: 200,
      })
      createdPlacements.push(placement)
    }
  }

  return {
    createdNodes,
    mappedRunIds,
    createdRelations,
    createdPlacements,
  }
}
