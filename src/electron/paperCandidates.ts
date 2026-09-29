import type { AgentPaper } from "../shared/agentChat"

export type PaperSource = AgentPaper["provider"]

export type PaperIds = {
  readonly doi: string | null
  readonly arxivId: string | null
  readonly s2Id: string | null
  readonly openAlexId: string | null
}

/** One paper found by any discovery source, normalized so sources can be merged. */
export type PaperCandidate = {
  readonly source: PaperSource
  readonly title: string
  readonly authors: readonly string[]
  readonly year: number | null
  readonly venue: string
  readonly abstract: string | null
  readonly landingUrl: string | null
  readonly fullTextUrl: string | null
  readonly citationCount: number | null
  readonly ids: PaperIds
}

export const noPaperIds: PaperIds = { doi: null, arxivId: null, s2Id: null, openAlexId: null }

const arxivDoiPrefix = "10.48550/arxiv."

/** The DataCite DOI arXiv registers for a paper; OpenAlex and Crossref-style lookups accept it. */
export function arxivDoiFor(arxivId: string): string {
  return `${arxivDoiPrefix}${arxivId.toLowerCase()}`
}

/** "Family, Given", as arXiv and DataCite write names, becomes "Given Family". */
export function displayName(name: string): string {
  const parts = name.split(",")
  if (parts.length !== 2) return name.trim()
  const [family, given] = parts
  return `${given?.trim() ?? ""} ${family?.trim() ?? ""}`.trim()
}

export function normalizedDoiValue(value: string | null | undefined): string | null {
  const doi = value
    ?.trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .replace(/^doi:/iu, "")
    .toLowerCase()
  return doi?.startsWith("10.") ? doi : null
}

export function normalizedArxivId(value: string | null | undefined): string | null {
  const match = value
    ?.trim()
    .match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:)?(\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z-]+)?\/\d{7})/iu)
  return match?.[1] ? match[1].toLowerCase() : null
}

export function arxivIdFromDoi(doi: string | null): string | null {
  return doi?.startsWith(arxivDoiPrefix)
    ? normalizedArxivId(doi.slice(arxivDoiPrefix.length))
    : null
}

export function normalizedTitleKey(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

export function candidateKeys(candidate: PaperCandidate): readonly string[] {
  const { doi, arxivId, s2Id, openAlexId } = candidate.ids
  const arxiv = arxivId ?? arxivIdFromDoi(doi)
  const title = normalizedTitleKey(candidate.title)
  return [
    doi ? `doi:${doi}` : null,
    arxiv ? `arxiv:${arxiv}` : null,
    s2Id ? `s2:${s2Id}` : null,
    openAlexId ? `openalex:${openAlexId.toLowerCase()}` : null,
    title.length >= 12 ? `title:${title}` : null,
  ].filter((key): key is string => key !== null)
}

function longer(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left
  return right.length > left.length ? right : left
}

function mergeIds(left: PaperIds, right: PaperIds): PaperIds {
  return {
    doi: left.doi ?? right.doi,
    arxivId: left.arxivId ?? right.arxivId ?? arxivIdFromDoi(left.doi ?? right.doi),
    s2Id: left.s2Id ?? right.s2Id,
    openAlexId: left.openAlexId ?? right.openAlexId,
  }
}

export function mergeCandidate(existing: PaperCandidate, incoming: PaperCandidate): PaperCandidate {
  return {
    ...existing,
    authors: existing.authors.length > 0 ? existing.authors : incoming.authors,
    year: existing.year ?? incoming.year,
    venue: existing.venue || incoming.venue,
    abstract: longer(existing.abstract, incoming.abstract),
    landingUrl: existing.landingUrl ?? incoming.landingUrl,
    fullTextUrl: existing.fullTextUrl ?? incoming.fullTextUrl,
    citationCount:
      existing.citationCount === null
        ? incoming.citationCount
        : Math.max(existing.citationCount, incoming.citationCount ?? 0),
    ids: mergeIds(existing.ids, incoming.ids),
  }
}

/**
 * Deduplicates candidates from every source into one pool. Each pooled paper keeps a stable id
 * (`p1`, `p2`, …) in discovery order so later rounds and the relevance judge can refer to it.
 */
export class CandidatePool {
  readonly #papers = new Map<string, PaperCandidate>()
  readonly #aliases = new Map<string, string>()

  /** Adds candidates and returns the ids of papers that were not already pooled. */
  add(candidates: readonly PaperCandidate[]): readonly string[] {
    const added: string[] = []
    for (const candidate of candidates) {
      const keys = candidateKeys(candidate)
      const known = keys.map((key) => this.#aliases.get(key)).find((id) => id !== undefined)
      const id = known ?? `p${this.#papers.size + 1}`
      const existing = this.#papers.get(id)
      const merged = existing ? mergeCandidate(existing, candidate) : candidate
      this.#papers.set(id, merged)
      for (const key of candidateKeys(merged)) this.#aliases.set(key, id)
      if (!existing) added.push(id)
    }
    return added
  }

  get(id: string): PaperCandidate | undefined {
    return this.#papers.get(id)
  }

  /** The pooled id a candidate was merged into, if it has been added. */
  idOf(candidate: PaperCandidate): string | undefined {
    return candidateKeys(candidate)
      .map((key) => this.#aliases.get(key))
      .find((id) => id !== undefined)
  }

  entries(): [string, PaperCandidate][] {
    return [...this.#papers.entries()]
  }

  get size(): number {
    return this.#papers.size
  }
}

export function toAgentPaper(
  candidate: PaperCandidate,
  judgment?: { readonly score: number; readonly reason: string },
): AgentPaper {
  return {
    provider: candidate.source,
    title: candidate.title.slice(0, 2_000),
    authors: candidate.authors
      .map((author) => author.slice(0, 500))
      .filter((author) => author.length > 0)
      .slice(0, 500),
    year: candidate.year,
    venue: candidate.venue.slice(0, 1_000),
    landingUrl: candidate.landingUrl,
    fullTextUrl: candidate.fullTextUrl,
    citationCount: candidate.citationCount,
    ...(judgment
      ? {
          relevance: judgment.score,
          ...(judgment.reason ? { reason: judgment.reason.slice(0, 300) } : {}),
        }
      : {}),
  }
}
