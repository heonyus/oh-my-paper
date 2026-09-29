import {
  arxivIdFromDoi,
  candidateKeys,
  normalizedDoiValue,
  normalizedTitleKey,
  type PaperCandidate,
} from "./paperCandidates"
import type { PaperSearchFunction } from "./paperDiscovery"
import { PaperSourceError } from "./paperSourceHttp"
import type { WebSearchEngine, WebSearchHit } from "./webSearchEngines"

export type PaperIdentifiers = {
  readonly arxivId: string | null
  readonly doi: string | null
}

/** How web hits become paper records; injected so tests stay offline. */
export type WebPaperResolver = {
  /** Records for the given DOIs and arXiv ids, in one request. */
  readonly byIds: (
    ids: { readonly dois: readonly string[]; readonly arxivIds: readonly string[] },
    signal?: AbortSignal,
  ) => Promise<readonly PaperCandidate[]>
  /** A paper the record index has not seen yet, from its arXiv abstract page. */
  readonly arxivAbstract: (arxivId: string, signal?: AbortSignal) => Promise<PaperCandidate | null>
  /** Records whose title may match a web page title. */
  readonly byTitle: (title: string, signal?: AbortSignal) => Promise<readonly PaperCandidate[]>
}

export type WebPaperLimits = {
  /** Web hits examined per query. */
  readonly hits: number
  /** arXiv abstract pages fetched per query for papers the index lacks. */
  readonly abstractFetches: number
  /** Title lookups per query for hits without an identifier. */
  readonly titleLookups: number
}

export const defaultWebPaperLimits: WebPaperLimits = {
  hits: 10,
  abstractFetches: 2,
  titleLookups: 2,
}

/** Hosts whose paths carry arXiv ids (mirrors, readers and paper hubs). */
const arxivHosts =
  /(^|\.)(arxiv\.org|ar5iv\.org|alphaxiv\.org|huggingface\.co|paperswithcode\.com|semanticscholar\.org|scirate\.com)$/iu
const modernArxivIdInPath = /(?:^|[/:])(\d{4}\.\d{4,5})(?:v\d+)?(?=$|[/?#.])/u
const legacyArxivIdInPath = /\/(?:abs|pdf|html)\/([a-z-]+(?:\.[a-z-]+)?\/\d{7})/iu
const arxivIdInText = /arxiv(?::\s?|\.org\/(?:abs|pdf|html)\/)(\d{4}\.\d{4,5})/iu
const doiInPath = /(10\.\d{4,9}\/[^\s?#]+)/iu
const doiViewSuffixes = /(?:\.(?:pdf|full|abstract|html)|\/(?:full|abstract|pdf|meta))+$/iu
const minimumTitleWords = 4
const minimumTitleKeyLength = 16

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}

function decodedPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname)
  } catch (error) {
    if (error instanceof URIError) return url.pathname
    throw error
  }
}

function arxivIdFromUrl(url: URL): string | null {
  if (!arxivHosts.test(url.hostname)) return null
  const path = decodedPath(url)
  const modern = path.match(modernArxivIdInPath)?.[1]
  if (modern) return modern
  const legacy = path.match(legacyArxivIdInPath)?.[1]
  return legacy ? legacy.toLowerCase() : null
}

function doiFromUrl(url: URL): string | null {
  const match = decodedPath(url).match(doiInPath)?.[1]
  if (!match) return null
  const bare = match.replace(doiViewSuffixes, "").replace(/[.,;:)\]]+$/u, "")
  // bioRxiv and medRxiv register the unversioned DOI.
  const doi = bare.startsWith("10.1101/") ? bare.replace(/v\d+$/iu, "") : bare
  return normalizedDoiValue(doi)
}

/** The arXiv id and DOI a web hit points at, from its URL first and its text second. */
export function paperIdentifiers(hit: WebSearchHit): PaperIdentifiers {
  const url = parsedUrl(hit.url)
  const doi = url ? doiFromUrl(url) : null
  const fromUrl = url ? arxivIdFromUrl(url) : null
  const fromText = `${hit.title} ${hit.snippet ?? ""}`.match(arxivIdInText)?.[1] ?? null
  return { arxivId: fromUrl ?? arxivIdFromDoi(doi) ?? fromText, doi }
}

function titleMatches(hit: WebSearchHit, candidate: PaperCandidate): boolean {
  const wanted = normalizedTitleKey(hit.title)
  const found = normalizedTitleKey(candidate.title)
  if (wanted.length < minimumTitleKeyLength || found.length < minimumTitleKeyLength) return false
  return wanted.includes(found) || found.includes(wanted)
}

function wordCount(text: string): number {
  return text.split(/\s+/u).filter((word) => word.length > 0).length
}

/** Runs one resolver call; a source failure only costs that hit, a cancellation stops the run. */
async function attempt<T>(
  task: () => Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T | null> {
  try {
    return await task()
  } catch (error) {
    if (signal?.aborted || !(error instanceof PaperSourceError)) throw error
    return null
  }
}

function inWindow(
  paper: PaperCandidate,
  window: { readonly yearFrom: number | null; readonly yearTo: number | null },
): boolean {
  return (
    paper.year === null ||
    ((window.yearFrom === null || paper.year >= window.yearFrom) &&
      (window.yearTo === null || paper.year <= window.yearTo))
  )
}

/**
 * A discovery source that searches the web and keeps only hits that resolve to a paper
 * record, in the engine's order: identifiers in URLs first, then arXiv pages the index lacks,
 * then page titles matched against the index.
 */
export function createWebPaperSearch(
  engine: WebSearchEngine,
  resolver: WebPaperResolver,
  limits: WebPaperLimits = defaultWebPaperLimits,
): PaperSearchFunction {
  return async (input, signal) => {
    const hits = (await engine.search(input.query, limits.hits, signal)).slice(0, limits.hits)
    const identified = hits.map((hit) => ({ hit, ids: paperIdentifiers(hit) }))
    const dois = [...new Set(identified.flatMap(({ ids }) => (ids.doi ? [ids.doi] : [])))]
    const arxivIds = [
      ...new Set(identified.flatMap(({ ids }) => (ids.arxivId ? [ids.arxivId] : []))),
    ]
    const resolved =
      dois.length + arxivIds.length > 0 ? await resolver.byIds({ dois, arxivIds }, signal) : []
    const byKey = new Map<string, PaperCandidate>()
    for (const candidate of resolved) {
      for (const key of candidateKeys(candidate)) byKey.set(key, candidate)
    }
    const budget = { abstracts: limits.abstractFetches, titles: limits.titleLookups }
    const seen = new Set<string>()
    const papers: PaperCandidate[] = []
    const keep = (candidate: PaperCandidate | null | undefined): void => {
      if (!candidate || !inWindow(candidate, input)) return
      const keys = candidateKeys(candidate)
      if (keys.some((key) => seen.has(key))) return
      for (const key of keys) seen.add(key)
      papers.push(candidate)
    }
    for (const { hit, ids } of identified) {
      const { arxivId, doi } = ids
      const known =
        (arxivId ? byKey.get(`arxiv:${arxivId}`) : undefined) ??
        (doi ? byKey.get(`doi:${doi}`) : undefined)
      if (known) {
        keep(known)
        continue
      }
      if (arxivId) {
        if (budget.abstracts <= 0) continue
        budget.abstracts -= 1
        keep(await attempt(() => resolver.arxivAbstract(arxivId, signal), signal))
        continue
      }
      // A DOI the index does not know yet cannot be resolved any further here.
      if (doi || budget.titles <= 0 || wordCount(hit.title) < minimumTitleWords) continue
      budget.titles -= 1
      const matches = await attempt(() => resolver.byTitle(hit.title, signal), signal)
      keep(matches?.find((candidate) => titleMatches(hit, candidate)))
    }
    return papers
  }
}
