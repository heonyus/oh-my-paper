import type { PageSourceBlock } from "./pageTranslationSource"
import type { CitationIndexEntry } from "./pdfCitationIndex"

function citationUrl(entry: CitationIndexEntry): string {
  if (entry.doi) return `https://doi.org/${entry.doi}`
  const direct = entry.rawText.match(/https:\/\/[^\s)>\]]+/u)?.[0]
  return direct ?? `https://scholar.google.com/scholar?q=${encodeURIComponent(entry.title)}`
}

function expandedKeys(value: string): readonly string[] {
  return value.split(/\s*,\s*/u).flatMap((part) => {
    const range = part.match(/^(\d{1,3})\s*[–-]\s*(\d{1,3})$/u)
    if (!range?.[1] || !range[2]) return /^\d{1,3}$/u.test(part) ? [part] : []
    const start = Number(range[1])
    const end = Number(range[2])
    if (end < start || end - start > 12) return []
    return Array.from({ length: end - start + 1 }, (_, index) => String(start + index))
  })
}

function linkedCluster(
  value: string,
  citations: ReadonlyMap<string, CitationIndexEntry>,
): string | null {
  const keys = expandedKeys(value)
  if (keys.length === 0) return null
  const entries = keys.map((key) => citations.get(key))
  if (entries.some((entry) => entry === undefined)) return null
  return entries
    .flatMap((entry, index) => {
      const key = keys[index]
      return entry && key ? [`[${key}](${citationUrl(entry)})`] : []
    })
    .join("; ")
}

function linkSourceCitations(
  source: string,
  citations: ReadonlyMap<string, CitationIndexEntry>,
): string {
  const bracketed = source.replace(/\[([\d,\s–-]+)\]/gu, (match, keys: string) => {
    const linked = linkedCluster(keys, citations)
    return linked ? `(${linked})` : match
  })
  return bracketed
}

export function withPageTranslationTextCitationLinks(
  value: string,
  citationEntries: readonly CitationIndexEntry[],
): string {
  return linkSourceCitations(
    value,
    new Map(citationEntries.map((entry) => [entry.key, entry] as const)),
  )
}

export function withPageTranslationCitationLinks<Block extends PageSourceBlock>(
  blocks: readonly Block[],
  citationEntries: readonly CitationIndexEntry[],
): readonly Block[] {
  const citations = new Map(citationEntries.map((entry) => [entry.key, entry] as const))
  return blocks.map((block) => ({
    ...block,
    source: linkSourceCitations(block.source, citations),
  }))
}
