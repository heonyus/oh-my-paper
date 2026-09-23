import { z } from "zod"
import type { AgentPaper } from "../shared/agentChat"

const S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
const S2_FIELDS =
  "paperId,title,abstract,authors,year,venue,externalIds,openAccessPdf,citationCount,url"
const S2_LIMIT_MAX = 10

const s2PaperSchema = z
  .object({
    paperId: z.string(),
    title: z.string().nullable().default(""),
    abstract: z.string().nullable().default(null),
    authors: z.array(z.object({ name: z.string().nullable().default("") })).default([]),
    year: z.number().int().nullable().default(null),
    venue: z.string().nullable().default(""),
    externalIds: z
      .object({
        DOI: z.string().optional(),
        ArXiv: z.string().optional(),
      })
      .nullable()
      .default(null),
    openAccessPdf: z.object({ url: z.string() }).nullable().default(null),
    citationCount: z.number().int().nullable().default(null),
    url: z.string().nullable().default(null),
  })
  .passthrough()

const s2SearchResponseSchema = z
  .object({
    data: z.array(s2PaperSchema).default([]),
  })
  .passthrough()

export type AgentSearchHit = {
  readonly paper: AgentPaper
  readonly abstract: string | null
  readonly dedupeKey: string
}

function httpUrl(value: string | null): string | null {
  if (!value) return null
  return /^https?:\/\//.test(value) ? value : null
}

function toHit(item: z.infer<typeof s2PaperSchema>): AgentSearchHit | null {
  const title = item.title?.trim()
  if (!title) return null
  const arxivId = item.externalIds?.ArXiv ?? null
  const landingUrl = httpUrl(item.url) ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : null)
  const fullTextUrl =
    httpUrl(item.openAccessPdf?.url ?? null) ??
    (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null)
  return {
    paper: {
      provider: "semanticscholar",
      title,
      authors: item.authors
        .map((author) => author.name?.trim() ?? "")
        .filter((name) => name.length > 0),
      year: item.year,
      venue: item.venue ?? "",
      landingUrl,
      fullTextUrl,
      citationCount: item.citationCount,
    },
    abstract: item.abstract,
    dedupeKey: (item.externalIds?.DOI ?? item.externalIds?.ArXiv ?? item.paperId).toLowerCase(),
  }
}

export async function searchSemanticScholar(
  query: string,
  options: { readonly limit?: number; readonly signal?: AbortSignal } = {},
): Promise<AgentSearchHit[]> {
  const url = new URL(S2_SEARCH_URL)
  url.searchParams.set("query", query.slice(0, 300))
  url.searchParams.set("limit", String(Math.min(Math.max(options.limit ?? 8, 1), S2_LIMIT_MAX)))
  url.searchParams.set("fields", S2_FIELDS)
  const { OH_MY_PAPER_S2_API_KEY: s2ApiKey } = process.env
  const apiKey = s2ApiKey?.trim()
  const response = await fetch(url, {
    headers: apiKey
      ? { accept: "application/json", "x-api-key": apiKey }
      : { accept: "application/json" },
    signal: options.signal ?? AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`semantic_scholar_http_${response.status}`)
  const parsed = s2SearchResponseSchema.parse(await response.json())
  const hits: AgentSearchHit[] = []
  for (const item of parsed.data) {
    const hit = toHit(item)
    if (hit) hits.push(hit)
  }
  return hits
}
