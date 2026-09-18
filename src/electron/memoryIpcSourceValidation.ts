import type { z } from "zod"
import type { KnowledgeNode, KnowledgeNodeId } from "../shared/knowledgeSchemas"
import {
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  knowledgeNodeIdSchema,
} from "../shared/knowledgeSchemas"
import type { MemorySourceEvidenceRequest } from "../shared/memoryIpc"
import type { MemoryEvidence, MemoryRecord } from "../shared/memorySchemas"
import type { CollectionService } from "./collectionService"

export type MemoryPdfEvidence = Readonly<{
  readonly sourceRevision: string
  readonly quote: string
  readonly page: number
}>

export interface MemorySourceRevisionReader {
  readonly readNodeRevision: (nodeId: z.infer<typeof knowledgeNodeIdSchema>) => string | null
  readonly readPdfEvidence: (
    anchorId: z.infer<typeof evidenceAnchorIdSchema>,
    documentVersionId: z.infer<typeof documentVersionIdSchema>,
  ) => MemoryPdfEvidence | null
}

export interface MemoryCanonicalSource {
  readonly getNode: (nodeId: KnowledgeNodeId) => KnowledgeNode | null
  readonly getIndexedNoteRevision: (nodeId: KnowledgeNodeId) => string | null
  readonly readPdfEvidence: MemorySourceRevisionReader["readPdfEvidence"]
}

export function createMemoryCollectionSourceReader(
  collection: Pick<CollectionService, "getNode" | "index">,
  readPdfEvidence: MemorySourceRevisionReader["readPdfEvidence"],
): MemorySourceRevisionReader {
  return createMemorySourceRevisionReader({
    getNode: (nodeId) => collection.getNode(nodeId),
    getIndexedNoteRevision: (nodeId) => collection.index.get(nodeId)?.revision ?? null,
    readPdfEvidence,
  })
}

export class MemorySourceValidationError extends Error {
  readonly name = "MemorySourceValidationError"
}

export function createMemorySourceRevisionReader(
  source: MemoryCanonicalSource,
): MemorySourceRevisionReader {
  return {
    readNodeRevision: (nodeId) =>
      source.getNode(nodeId) ? source.getIndexedNoteRevision(nodeId) : null,
    readPdfEvidence: source.readPdfEvidence,
  }
}

export function buildMemoryEvidence(
  reader: MemorySourceRevisionReader | undefined,
  references: readonly MemorySourceEvidenceRequest[],
): readonly MemoryEvidence[] {
  if (references.length > 0 && !reader) {
    throw new MemorySourceValidationError("Source evidence requires the local knowledge database")
  }
  return references.map((reference) => evidenceFromReference(reader, reference))
}

export function validateMemoryRecordEvidence(
  reader: MemorySourceRevisionReader | undefined,
  record: MemoryRecord,
): void {
  if (record.evidence.length === 0) return
  if (!reader) {
    throw new MemorySourceValidationError("Source-dependent memory cannot be approved offline")
  }
  record.evidence.forEach((evidence) => {
    if (evidence.kind === "knowledge-record") {
      const nodeId = parseNodeSourceKey(evidence.sourceKey)
      const currentRevision = nodeId ? reader.readNodeRevision(nodeId) : null
      if (currentRevision !== evidence.sourceRevision) {
        throw new MemorySourceValidationError("The knowledge record revision changed")
      }
      return
    }
    if (evidence.kind === "pdf-fragment") {
      const source = parsePdfSourceKey(evidence.sourceKey)
      const current = source
        ? reader.readPdfEvidence(source.anchorId, source.documentVersionId)
        : null
      if (!current || current.sourceRevision !== evidence.sourceRevision) {
        throw new MemorySourceValidationError("The PDF evidence revision changed")
      }
      return
    }
    throw new MemorySourceValidationError("Only validated node and PDF evidence may be approved")
  })
}

export function currentMemoryEvidenceRevision(
  reader: MemorySourceRevisionReader | undefined,
  evidence: MemoryEvidence,
): string | null {
  if (!reader) return null
  if (evidence.kind === "knowledge-record") {
    const nodeId = parseNodeSourceKey(evidence.sourceKey)
    return nodeId ? reader.readNodeRevision(nodeId) : null
  }
  if (evidence.kind === "pdf-fragment") {
    const source = parsePdfSourceKey(evidence.sourceKey)
    const current = source
      ? reader.readPdfEvidence(source.anchorId, source.documentVersionId)
      : null
    return current?.sourceRevision ?? null
  }
  return null
}

function evidenceFromReference(
  reader: MemorySourceRevisionReader | undefined,
  reference: MemorySourceEvidenceRequest,
): MemoryEvidence {
  if (!reader) throw new MemorySourceValidationError("Missing local source validator")
  switch (reference.kind) {
    case "node": {
      const revision = reader.readNodeRevision(reference.nodeId)
      if (!revision || revision !== reference.sourceRevision) {
        throw new MemorySourceValidationError("The knowledge record revision is stale")
      }
      return {
        kind: "knowledge-record",
        sourceKey: `node:${reference.nodeId}`,
        sourceRevision: revision,
        quote: null,
        page: null,
      }
    }
    case "pdf-fragment": {
      const evidence = reader.readPdfEvidence(
        reference.evidenceAnchorId,
        reference.documentVersionId,
      )
      if (!evidence || evidence.sourceRevision !== reference.sourceRevision) {
        throw new MemorySourceValidationError("The PDF evidence revision is stale")
      }
      return {
        kind: "pdf-fragment",
        sourceKey: `pdf-fragment:${reference.documentVersionId}:${reference.evidenceAnchorId}`,
        sourceRevision: evidence.sourceRevision,
        quote: evidence.quote,
        page: evidence.page,
      }
    }
    default:
      return assertNever(reference)
  }
}

function parseNodeSourceKey(sourceKey: string): z.infer<typeof knowledgeNodeIdSchema> | null {
  const parts = sourceKey.split(":")
  if (parts.length !== 2 || parts[0] !== "node") return null
  const parsed = knowledgeNodeIdSchema.safeParse(parts[1])
  return parsed.success ? parsed.data : null
}

function parsePdfSourceKey(sourceKey: string): Readonly<{
  readonly documentVersionId: z.infer<typeof documentVersionIdSchema>
  readonly anchorId: z.infer<typeof evidenceAnchorIdSchema>
}> | null {
  const parts = sourceKey.split(":")
  if (parts.length !== 3 || parts[0] !== "pdf-fragment") return null
  const documentVersionId = documentVersionIdSchema.safeParse(parts[1])
  const anchorId = evidenceAnchorIdSchema.safeParse(parts[2])
  if (!documentVersionId.success || !anchorId.success) return null
  return { documentVersionId: documentVersionId.data, anchorId: anchorId.data }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected source evidence variant: ${String(value)}`)
}
