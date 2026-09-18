import type {
  CanvasExportResult,
  CanvasImportPreview,
  ExperimentCommitOptions,
  ExperimentCommitResult,
  ExperimentImportPreview,
  MarkdownImportCommitResult,
  MarkdownImportPreview,
  ParsedMarkdownNode,
  ZoteroCommitOptions,
  ZoteroCommitResult,
  ZoteroImportItemPreview,
  ZoteroImportPreview,
} from "../shared/interchangeTypes"
import type {
  BoardId,
  ExternalMapping,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
  PlacementRecord,
} from "../shared/knowledgeSchemas"
import type { CollectionService } from "./collectionService"
import { commitCanonicalMarkdownNodes } from "./interchangeCanonicalImport"
import { exportBoardToJsonCanvas } from "./interchangeCanvasExport"
import {
  buildCanvasImportPlacements,
  parseCanvasSidecar,
  parseJsonCanvas,
  previewCanvasImport,
} from "./interchangeCanvasImport"
import { previewExperimentJsonl } from "./interchangeExperiment"
import { commitExperimentRecords } from "./interchangeExperimentCommit"
import { previewMarkdownImport } from "./interchangeMarkdownImport"
import {
  commitMarkdownNodes,
  exportMarkdownNode,
  runInSavepoint,
} from "./interchangeServicePersistence"
import { parseZoteroExportJson, previewZoteroImport } from "./interchangeZotero"
import { commitZoteroItems } from "./interchangeZoteroCommit"
import { fetchLocalZoteroItems, type ZoteroFetchOptions } from "./interchangeZoteroFetch"
import { getCanonicalZoteroMappings } from "./interchangeZoteroMappings"
import type { KnowledgeRepository } from "./knowledgeRepository"

export type InterchangeServiceOptions = {
  readonly collection?: CollectionService
}

export class InterchangeService {
  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly options: InterchangeServiceOptions = {},
  ) {}

  exportNodeToMarkdown(nodeId: KnowledgeNodeId): string {
    return exportMarkdownNode(this.repo, nodeId)
  }

  previewMarkdownImport(files: readonly string[]): MarkdownImportPreview {
    return previewMarkdownImport(files, (id) => this.repo.getNode(id))
  }

  async commitMarkdownImport(
    nodesToImport: readonly ParsedMarkdownNode[],
  ): Promise<MarkdownImportCommitResult> {
    return this.options.collection
      ? await commitCanonicalMarkdownNodes(this.options.collection, nodesToImport)
      : commitMarkdownNodes(this.repo, nodesToImport)
  }

  exportBoardCanvas(boardId: BoardId): CanvasExportResult {
    const placements = this.repo.findPlacementsForBoard(boardId)
    const nodeMap = new Map<KnowledgeNodeId, KnowledgeNode>()
    for (const p of placements) {
      if (!nodeMap.has(p.nodeId)) {
        const n = this.repo.getNode(p.nodeId)
        if (n) nodeMap.set(n.id, n)
      }
    }

    const allRelations: KnowledgeRelation[] = []
    const seenRelationIds = new Set<string>()
    for (const nodeId of nodeMap.keys()) {
      const rels = this.repo.findRelations({ nodeId })
      for (const r of rels) {
        if (!seenRelationIds.has(r.id)) {
          seenRelationIds.add(r.id)
          allRelations.push(r)
        }
      }
    }

    return exportBoardToJsonCanvas(boardId, placements, Array.from(nodeMap.values()), allRelations)
  }

  previewCanvasImport(canvasJson: string, sidecarJson: string): CanvasImportPreview {
    const canvas = parseJsonCanvas(canvasJson)
    const sidecar = parseCanvasSidecar(sidecarJson)
    return previewCanvasImport(canvas, sidecar, (id) => this.repo.getNode(id))
  }

  commitCanvasImport(
    preview: CanvasImportPreview,
    targetBoardId: BoardId,
  ): readonly PlacementRecord[] {
    return runInSavepoint(this.repo, () => {
      if (!preview.isValid) {
        throw new Error("Cannot commit an invalid canvas import preview")
      }
      const targetBoard = this.repo.getBoard(targetBoardId)
      if (!targetBoard) {
        throw new Error(`Target board not found: ${targetBoardId}`)
      }

      for (const item of preview.nodesToPlace) {
        const node = this.repo.getNode(item.nodeId)
        if (!node) {
          throw new Error(`Cannot commit canvas import: node not found: ${item.nodeId}`)
        }
      }

      const placementsToCreate = buildCanvasImportPlacements(preview, targetBoardId)
      const created: PlacementRecord[] = []
      for (const p of placementsToCreate) {
        created.push(this.repo.createPlacement(p))
      }
      return created
    })
  }

  previewExperimentJsonl(rawLines: string): ExperimentImportPreview {
    return previewExperimentJsonl(rawLines)
  }

  commitExperimentImport(
    records: readonly import("../shared/interchangeSchemas").ExperimentRecordV1[],
    options?: ExperimentCommitOptions,
  ): ExperimentCommitResult {
    return runInSavepoint(this.repo, () => {
      return commitExperimentRecords(this.repo, records, options)
    })
  }

  previewZoteroFileImport(
    rawJson: string,
    _existingMappings?: readonly ExternalMapping[],
    libraryKey = "default",
  ): ZoteroImportPreview {
    const items = parseZoteroExportJson(rawJson)
    const canonicalMappings = getCanonicalZoteroMappings(this.repo)
    return previewZoteroImport(items, canonicalMappings, [], libraryKey)
  }

  async fetchAndPreviewLocalZotero(
    options: ZoteroFetchOptions = {},
    _existingMappings?: readonly ExternalMapping[],
    libraryKey = "local",
  ): Promise<ZoteroImportPreview> {
    const { items } = await fetchLocalZoteroItems(options)
    const canonicalMappings = getCanonicalZoteroMappings(this.repo)
    return previewZoteroImport(items, canonicalMappings, [], libraryKey)
  }

  commitZoteroImport(
    items: readonly ZoteroImportItemPreview[],
    options?: ZoteroCommitOptions,
  ): ZoteroCommitResult {
    return runInSavepoint(this.repo, () => {
      return commitZoteroItems(this.repo, items, options)
    })
  }
}
