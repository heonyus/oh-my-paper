import type { ExternalMapping } from "../shared/knowledgeSchemas"
import { externalMappingSchema } from "../shared/knowledgeSchemas"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { externalMappingRowSchema, parseJsonSafe } from "./knowledgeRepositoryRows"

export function getCanonicalZoteroMappings(
  repository: KnowledgeRepository,
): readonly ExternalMapping[] {
  const rows = repository.db
    .prepare("SELECT * FROM external_mappings WHERE system = 'zotero'")
    .all()
  return rows.map((raw) => {
    const row = externalMappingRowSchema.parse(raw)
    return externalMappingSchema.parse({
      id: row.id,
      nodeId: row.node_id,
      system: row.system,
      externalId: row.external_id,
      isFullTextReviewed: Boolean(row.is_full_text_reviewed),
      metadata: parseJsonSafe(row.metadata_json),
      createdAt: row.created_at,
    })
  })
}
