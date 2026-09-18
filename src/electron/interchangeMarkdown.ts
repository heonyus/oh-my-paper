import {
  type MarkdownFrontMatter,
  type MarkdownRelationItem,
  markdownFrontMatterSchema,
} from "../shared/interchangeSchemas"
import type { ParsedMarkdownNode } from "../shared/interchangeTypes"
import type {
  DocumentVersionRecord,
  EvidenceAnchor,
  KnowledgeNode,
  KnowledgeRelation,
} from "../shared/knowledgeSchemas"

const FRONT_MATTER_DELIMITER = "---"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sanitizePathString(value: string): string {
  return value.replace(/\/(Users|home|private|var|tmp)\/[^\s"'`]+/g, "[redacted-path]")
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizePathString(value)
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (isRecord(value)) return sanitizeMetadata(value)
  return value
}

export function sanitizeMetadata(meta: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (/api[_-]?key|secret|password|auth|credential|private[_-]?key/i.test(k)) {
      continue
    }
    result[k] = sanitizeValue(v)
  }
  return result
}

export function serializeMarkdownNode(
  node: KnowledgeNode,
  evidenceAnchors: readonly EvidenceAnchor[] = [],
  relations: readonly KnowledgeRelation[] = [],
  documentVersions: readonly DocumentVersionRecord[] = [],
): string {
  const cleanAnchors = evidenceAnchors.map((a) => ({
    id: a.id,
    documentVersionId: a.documentVersionId,
    page: a.page,
    quote: a.quote,
    x: a.x,
    y: a.y,
    fragments: a.fragments,
    ...(a.astRanges ? { astRanges: a.astRanges } : {}),
    createdAt: a.createdAt,
  }))

  const cleanRelations: MarkdownRelationItem[] = relations.map((r) => {
    const isOutgoing = r.sourceId === node.id
    const direction: MarkdownRelationItem["direction"] = isOutgoing ? "outgoing" : "incoming"
    return {
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      direction,
      evidenceIds: [...r.evidenceIds],
      predicate: r.predicate,
      reviewState: r.reviewState,
      provenance: r.provenance,
    }
  })

  const cleanVersions = documentVersions.map((v) => ({
    id: v.id,
    originalDocumentId: v.originalDocumentId,
    paperNodeId: v.paperNodeId,
    hash: v.hash,
    metadata: sanitizeMetadata({
      ...v.metadata,
      isFullTextReviewed: false,
      sourceUnavailable: true,
    }),
    createdAt: v.createdAt,
  }))

  const frontMatter: MarkdownFrontMatter = {
    format: "scourgify-node-v1",
    version: "1.0",
    id: node.id,
    kind: node.kind,
    title: node.title,
    aliases: [...node.aliases],
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    metadata: sanitizeMetadata(node.metadata),
    evidenceAnchors: cleanAnchors,
    documentVersions: cleanVersions,
    outgoingRelations: cleanRelations,
  }

  const jsonHeader = JSON.stringify(frontMatter, null, 2)
  return `${FRONT_MATTER_DELIMITER}json\n${jsonHeader}\n${FRONT_MATTER_DELIMITER}\n\n# ${node.title}\n\n${node.body}`
}

export function parseMarkdownNode(content: string): ParsedMarkdownNode {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith(FRONT_MATTER_DELIMITER)) {
    throw new Error("Missing front matter delimiter")
  }

  const firstNewline = trimmed.indexOf("\n")
  if (firstNewline === -1) {
    throw new Error("Malformed markdown file")
  }

  const afterFirstLine = trimmed.slice(firstNewline + 1)
  const closingIndex = afterFirstLine.indexOf(`\n${FRONT_MATTER_DELIMITER}`)
  if (closingIndex === -1) {
    throw new Error("Closing front matter delimiter not found")
  }

  const rawJson = afterFirstLine.slice(0, closingIndex).trim()
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawJson)
  } catch (err) {
    throw new Error(`Front matter JSON parsing failed: ${String(err)}`)
  }

  const parseResult = markdownFrontMatterSchema.safeParse(parsedJson)
  if (!parseResult.success) {
    throw new Error(`Front matter validation failed: ${parseResult.error.message}`)
  }

  const bodyStart = closingIndex + 1 + FRONT_MATTER_DELIMITER.length
  let body = afterFirstLine.slice(bodyStart).trimStart()
  if (body.startsWith("\n")) {
    body = body.slice(1)
  }

  const headerPrefix = `# ${parseResult.data.title}`
  if (body.startsWith(headerPrefix)) {
    body = body.slice(headerPrefix.length).trimStart()
  }

  return {
    frontMatter: parseResult.data,
    body: body.trim(),
  }
}
