import type { KnowledgeNodeId } from "../../shared/knowledgeSchemas"
import { type KnowledgeNode, knowledgeNodeIdSchema } from "../../shared/knowledgeSchemas"

export interface ResolvedLinkMatch {
  readonly raw: string
  readonly inner: string
  readonly label: string
  readonly targetId: KnowledgeNodeId | null
  readonly targetNode: KnowledgeNode | null
  readonly status: "resolved" | "ambiguous" | "unresolved"
}

export interface LinkCompletion {
  readonly title: string
  readonly node: KnowledgeNode
}

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g

export function extractWikiLinks(text: string): readonly string[] {
  const results: string[] = []
  const matches = text.matchAll(WIKILINK_REGEX)
  for (const match of matches) {
    const link = match[1]?.trim()
    if (link && !results.includes(link)) {
      results.push(link)
    }
  }
  return results
}

export function resolveWikiLinks(
  text: string,
  nodes: readonly KnowledgeNode[],
): readonly ResolvedLinkMatch[] {
  const lookup = new Map<string, KnowledgeNode[]>()
  for (const node of nodes) {
    const keys = [node.title, ...node.aliases]
    for (const key of keys) {
      const normalized = key.trim().toLocaleLowerCase()
      const matches = lookup.get(normalized) ?? []
      lookup.set(normalized, [...matches, node])
    }
  }

  const results: ResolvedLinkMatch[] = []
  const matches = text.matchAll(WIKILINK_REGEX)
  for (const match of matches) {
    const inner = match[1]?.trim() ?? ""
    const separator = inner.indexOf("|")
    const canonicalId = separator >= 0 ? inner.slice(0, separator).trim() : ""
    const label = (separator >= 0 ? inner.slice(separator + 1) : inner).trim()
    const parsedId = knowledgeNodeIdSchema.safeParse(canonicalId)
    if (parsedId.success) {
      const targetNode = nodes.find((node) => node.id === parsedId.data) ?? null
      results.push({
        raw: match[0],
        inner,
        label,
        targetId: parsedId.data,
        targetNode,
        status: targetNode ? "resolved" : "unresolved",
      })
      continue
    }
    const matches = lookup.get(label.toLocaleLowerCase()) ?? []
    const targetNode = matches.length === 1 ? (matches[0] ?? null) : null
    results.push({
      raw: match[0],
      inner,
      label,
      targetId: targetNode?.id ?? null,
      targetNode,
      status: matches.length === 1 ? "resolved" : matches.length > 1 ? "ambiguous" : "unresolved",
    })
  }
  return results
}

export function findLinkCompletions(
  query: string,
  nodes: readonly KnowledgeNode[],
): readonly LinkCompletion[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const suggestions: LinkCompletion[] = []
  for (const node of nodes) {
    if (
      node.title.toLocaleLowerCase().includes(needle) ||
      node.id.toLocaleLowerCase().includes(needle)
    ) {
      suggestions.push({ title: node.title, node })
    } else {
      const matchingAlias = node.aliases.find((a) => a.toLocaleLowerCase().includes(needle))
      if (matchingAlias) {
        suggestions.push({ title: matchingAlias, node })
      }
    }
  }
  return suggestions.slice(0, 8)
}
