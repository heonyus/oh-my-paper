import {
  discoverySavedMetadataResultSchema,
  discoverySaveResultSchema,
} from "../shared/discoveryIpc"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import type { CreateNodeInput, NodeFilter } from "../shared/knowledgeTypes"
import type { ScholarlySearchItem } from "../shared/scholarlySearchSchemas"

type KnowledgeWriter = {
  readonly findNodes: (filter?: NodeFilter) => readonly KnowledgeNode[]
  readonly createNode: (input: CreateNodeInput) => KnowledgeNode
}

function identityKeys(item: ScholarlySearchItem): readonly string[] {
  const values = [
    item.identity.doi ? `doi:${item.identity.doi.toLowerCase()}` : null,
    item.identity.arxivId ? `arxiv:${item.identity.arxivId.toLowerCase()}` : null,
    item.identity.openAlexId ? `openalex:${item.identity.openAlexId.toLowerCase()}` : null,
    `${item.provider}:${item.identity.providerRecordId.toLowerCase()}`,
  ]
  return [...new Set(values.filter((value): value is string => value !== null))]
}

function findDuplicate(knowledge: KnowledgeWriter, keys: readonly string[]): KnowledgeNode | null {
  for (const key of keys) {
    const nodes = knowledge.findNodes({ kind: "paper", search: key, limit: 100 })
    const duplicate = nodes.find((node) => node.aliases.some((alias) => keys.includes(alias)))
    if (duplicate) return duplicate
  }
  return null
}

export function saveScholarlyMetadata(knowledge: KnowledgeWriter, item: ScholarlySearchItem) {
  const aliases = identityKeys(item)
  const duplicate = findDuplicate(knowledge, aliases)
  if (duplicate) return discoverySaveResultSchema.parse({ status: "duplicate", node: duplicate })
  const node = knowledge.createNode({
    kind: "paper",
    title: item.title,
    body: "",
    aliases,
    metadata: {
      source: "scholarly_search",
      provider: item.provider,
      identity: item.identity,
      authors: item.authors,
      year: item.year,
      venue: item.venue,
      abstract: item.abstract,
      landingUrl: item.landingUrl,
      citationCount: item.citationCount,
      access: item.access,
      fullTextReviewed: false,
    },
  })
  return discoverySaveResultSchema.parse({ status: "saved", node })
}

export function listScholarlyMetadata(knowledge: KnowledgeWriter) {
  return discoverySavedMetadataResultSchema.parse({
    items: knowledge
      .findNodes({ kind: "paper", limit: 1_000 })
      .filter((node) => node.metadata["source"] === "scholarly_search"),
  })
}
