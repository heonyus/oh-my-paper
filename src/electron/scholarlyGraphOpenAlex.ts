import { z } from "zod"
import type {
  ParsedScholarlyGraphRequest,
  ScholarlyGraphArticle,
  ScholarlyGraphDirection,
} from "../shared/scholarlyGraphSchemas"
import { type ScholarlyTransport, ScholarlyTransportError } from "./scholarlySearchTransport"

const openAlexWorkSchema = z.object({
  id: z.string().regex(/^https:\/\/openalex\.org\/W\d+$/u),
  title: z.string().min(1),
  publication_year: z.number().int().nullable().optional(),
  doi: z.string().nullable().optional(),
  authorships: z
    .array(z.object({ author: z.object({ display_name: z.string().nullable().optional() }) }))
    .default([]),
  cited_by_count: z.number().int().nonnegative().nullable().optional(),
  primary_location: z
    .object({ landing_page_url: z.string().url().nullable().optional() })
    .nullable()
    .optional(),
  abstract_inverted_index: z
    .record(z.string(), z.array(z.number().int().nonnegative()))
    .nullable()
    .optional(),
  referenced_works: z.array(z.string().regex(/^https:\/\/openalex\.org\/W\d+$/u)).default([]),
  related_works: z.array(z.string().regex(/^https:\/\/openalex\.org\/W\d+$/u)).default([]),
  cited_by_api_url: z.string().url().nullable().optional(),
})
const worksEnvelopeSchema = z.object({
  meta: z.object({ count: z.number().int().nonnegative() }),
  results: z.array(openAlexWorkSchema),
})

export type OpenAlexWork = z.infer<typeof openAlexWorkSchema>
type DirectionFetch = { readonly works: readonly OpenAlexWork[]; readonly total: number }
type GraphFailureKind =
  | "timeout"
  | "cancelled"
  | "network"
  | "oversized"
  | "rate_limited"
  | "http_error"
  | "malformed_response"

export class ScholarlyGraphError extends Error {
  readonly name = "ScholarlyGraphError"

  constructor(
    readonly kind: GraphFailureKind,
    readonly httpStatus: number | null = null,
  ) {
    super(`Scholarly graph request failed: ${kind}`)
  }
}

function workUrl(value: string): URL {
  const id = value.match(/(?:openalex\.org\/)?(W\d+)$/iu)?.[1]
  if (!id) throw new ScholarlyGraphError("malformed_response")
  return new URL(`https://api.openalex.org/works/${id}`)
}

function seedUrl(request: ParsedScholarlyGraphRequest): URL {
  if (request.seed.openAlexId) return workUrl(request.seed.openAlexId)
  const doi = request.seed.doi
  if (!doi) throw new ScholarlyGraphError("malformed_response")
  return new URL(`https://api.openalex.org/works/${encodeURIComponent(`https://doi.org/${doi}`)}`)
}

function appendSelection(url: URL, limit: number): URL {
  const result = new URL(url)
  result.searchParams.set(
    "select",
    "id,title,publication_year,doi,authorships,cited_by_count,primary_location,abstract_inverted_index,referenced_works,related_works,cited_by_api_url",
  )
  result.searchParams.set("per-page", String(limit))
  return result
}

function worksByIds(ids: readonly string[], limit: number): URL {
  const url = new URL("https://api.openalex.org/works")
  url.searchParams.set("filter", `ids.openalex:${ids.slice(0, limit).join("|")}`)
  return appendSelection(url, limit)
}

async function getJson(
  url: URL,
  transport: ScholarlyTransport,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    const response = await transport(url, signal)
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new ScholarlyGraphError(
        response.statusCode === 429 ? "rate_limited" : "http_error",
        response.statusCode,
      )
    }
    try {
      const parsed: unknown = JSON.parse(response.body)
      return parsed
    } catch (error) {
      if (error instanceof SyntaxError) throw new ScholarlyGraphError("malformed_response", 200)
      throw error
    }
  } catch (error) {
    if (error instanceof ScholarlyGraphError) throw error
    if (error instanceof ScholarlyTransportError) {
      const kind = error.kind === "oversized" ? "oversized" : error.kind
      throw new ScholarlyGraphError(kind, null)
    }
    throw error
  }
}

function parseWork(value: unknown): OpenAlexWork {
  const result = openAlexWorkSchema.safeParse(value)
  if (!result.success) throw new ScholarlyGraphError("malformed_response", 200)
  return result.data
}

export function toGraphArticle(work: OpenAlexWork): ScholarlyGraphArticle {
  const entries = Object.entries(work.abstract_inverted_index ?? {})
    .flatMap(([word, positions]) => positions.map((position) => ({ word, position })))
    .sort((left, right) => left.position - right.position)
  const abstract = entries.length > 0 ? entries.map(({ word }) => word).join(" ") : null
  const doi = work.doi?.trim() || null
  const doiUrl = doi
    ? doi.startsWith("https://doi.org/")
      ? doi
      : `https://doi.org/${doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")}`
    : null
  const landingUrl = work.primary_location?.landing_page_url
  let sourceUrl: string | null = doiUrl
  if (landingUrl) {
    try {
      sourceUrl = new URL(landingUrl).protocol === "https:" ? landingUrl : doiUrl
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
  }
  return {
    id: work.id,
    provider: "openalex",
    title: work.title.replace(/\s+/gu, " ").trim(),
    authors: work.authorships.flatMap(({ author }) =>
      author.display_name ? [author.display_name] : [],
    ),
    year: work.publication_year ?? null,
    citationCount: work.cited_by_count ?? null,
    doi,
    sourceUrl,
    abstract,
  }
}

function citedByUrl(seed: OpenAlexWork, limit: number): URL {
  const id = seed.id.match(/(?:openalex\.org\/)(W\d+)$/iu)?.[1]
  if (!id) throw new ScholarlyGraphError("malformed_response")
  return appendSelection(new URL(`https://api.openalex.org/works?filter=cites:${id}`), limit)
}

export async function fetchOpenAlexSeed(
  request: ParsedScholarlyGraphRequest,
  transport: ScholarlyTransport,
  signal: AbortSignal,
): Promise<OpenAlexWork> {
  return parseWork(await getJson(appendSelection(seedUrl(request), 1), transport, signal))
}

export async function fetchOpenAlexDirection(
  direction: ScholarlyGraphDirection,
  seed: OpenAlexWork,
  limit: number,
  transport: ScholarlyTransport,
  signal: AbortSignal,
): Promise<DirectionFetch> {
  if (direction === "cited_by") {
    const value = await getJson(citedByUrl(seed, limit), transport, signal)
    const envelope = worksEnvelopeSchema.safeParse(value)
    if (!envelope.success) throw new ScholarlyGraphError("malformed_response", 200)
    const works = envelope.data.results.filter((work) => work.referenced_works.includes(seed.id))
    return { works: works.slice(0, limit), total: envelope.data.meta.count }
  }
  const ids = direction === "references" ? seed.referenced_works : seed.related_works
  if (ids.length === 0) return { works: [], total: 0 }
  const value = await getJson(worksByIds(ids, limit), transport, signal)
  const envelope = worksEnvelopeSchema.safeParse(value)
  if (!envelope.success) throw new ScholarlyGraphError("malformed_response", 200)
  const requested = new Set(ids.slice(0, limit))
  return {
    works: envelope.data.results.filter((work) => requested.has(work.id)).slice(0, limit),
    total: ids.length,
  }
}
