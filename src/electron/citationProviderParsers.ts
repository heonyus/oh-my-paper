import { z } from "zod"
import { type CitationPaper, citationPaperSchema } from "../shared/ipc"
import { normalizedDoi } from "./citationMatching"

const rawPaperSchema = z.object({
  paperId: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.object({ name: z.string().min(1).nullable().optional() })).default([]),
  year: z.number().int().nullable().optional(),
  venue: z.string().optional(),
  abstract: z.string().nullable().optional(),
  externalIds: z.object({ DOI: z.string().min(1).nullable().optional() }).optional(),
  url: z.string().url().nullable().optional(),
  openAccessPdf: z.object({ url: z.string().url().nullable().optional() }).nullable().optional(),
  citationCount: z.number().int().nonnegative().nullable().optional(),
})
const semanticScholarResponseSchema = z.object({ data: z.array(rawPaperSchema) })
const semanticScholarReferencesResponseSchema = z.object({
  data: z.array(z.object({ citedPaper: rawPaperSchema.nullable() })),
})
const crossrefResponseSchema = z.object({
  message: z.object({
    items: z.array(
      z.object({
        DOI: z.string().min(1).optional(),
        title: z.array(z.string().min(1)).default([]),
        author: z
          .array(z.object({ given: z.string().optional(), family: z.string().optional() }))
          .default([]),
        published: z.object({ "date-parts": z.array(z.array(z.number().int())) }).optional(),
        "container-title": z.array(z.string()).default([]),
        abstract: z.string().optional(),
        URL: z.string().url().optional(),
        "is-referenced-by-count": z.number().int().nonnegative().optional(),
      }),
    ),
  }),
})
const arxivEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  published: z.string().min(1),
  author: z.array(z.object({ name: z.string().min(1) })).default([]),
  summary: z.string().optional(),
})
const arxivResponseSchema = z.object({
  entry: z.union([arxivEntrySchema, z.array(arxivEntrySchema)]).optional(),
})
const openAlexWorkSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publication_year: z.number().int().nullable().optional(),
  doi: z.string().nullable().optional(),
  authorships: z
    .array(z.object({ author: z.object({ display_name: z.string().nullable().optional() }) }))
    .default([]),
  cited_by_count: z.number().int().nonnegative().nullable().optional(),
  primary_location: z
    .object({
      source: z.object({ display_name: z.string().nullable().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
})

function isHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).protocol === "https:" ? value : null
  } catch {
    return null
  }
}

function arxivHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.hostname !== "arxiv.org" && url.hostname !== "www.arxiv.org") return null
    if (url.protocol === "http:") url.protocol = "https:"
    return url.protocol === "https:" ? url.toString() : null
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}

function plainText(value: string | null | undefined): string | null {
  if (!value) return null
  return (
    value
      .replace(/<[^>]+>/gu, " ")
      .replace(/\s+/gu, " ")
      .trim() || null
  )
}

export function parseJson(body: string): unknown | null {
  try {
    return JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export function parsePapers(value: unknown): readonly CitationPaper[] {
  const parsed = semanticScholarResponseSchema.safeParse(value)
  if (!parsed.success) return []
  return parsed.data.data.flatMap((item) => {
    const paper = citationPaperSchema.safeParse({
      paperId: item.paperId,
      title: item.title,
      authors: item.authors.flatMap((author) => (author.name ? [author.name] : [])),
      year: item.year ?? null,
      venue: item.venue ?? "",
      abstract: item.abstract ?? null,
      doi: item.externalIds?.DOI ?? null,
      url: isHttpsUrl(item.url),
      openAccessUrl: isHttpsUrl(item.openAccessPdf?.url),
      citationCount: item.citationCount ?? null,
    })
    return paper.success ? [paper.data] : []
  })
}

export function parseReferencePapers(value: unknown): readonly CitationPaper[] {
  const parsed = semanticScholarReferencesResponseSchema.safeParse(value)
  return parsed.success
    ? parsePapers({
        data: parsed.data.data.flatMap(({ citedPaper }) => (citedPaper ? [citedPaper] : [])),
      })
    : []
}

export function parseCrossrefPapers(value: unknown): readonly CitationPaper[] {
  const parsed = crossrefResponseSchema.safeParse(value)
  if (!parsed.success) return []
  return parsed.data.message.items.flatMap((item) => {
    const title = item.title[0]
    if (!title) return []
    const year = item.published?.["date-parts"][0]?.[0] ?? null
    const doi = item.DOI ?? null
    const url = isHttpsUrl(item.URL) ?? (doi ? `https://doi.org/${doi}` : null)
    const paper = citationPaperSchema.safeParse({
      paperId: doi ?? url ?? title,
      title,
      authors: item.author.map(({ given, family }) => [given, family].filter(Boolean).join(" ")),
      year,
      venue: item["container-title"][0] ?? "",
      abstract: plainText(item.abstract),
      doi,
      url,
      openAccessUrl: null,
      citationCount: item["is-referenced-by-count"] ?? null,
    })
    return paper.success ? [paper.data] : []
  })
}

export function parseArxivXml(body: string): unknown {
  const entries = [...body.matchAll(/<entry>([\s\S]*?)<\/entry>/gu)].map((entry) => {
    const pick = (tag: string): string =>
      entry[1]?.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "u"))?.[1]?.trim() ?? ""
    const authors = [...(entry[1]?.matchAll(/<name>([\s\S]*?)<\/name>/gu) ?? [])]
      .map((match) => match[1]?.trim() ?? "")
      .filter((name) => name.length > 0)
    return {
      id: pick("id"),
      title: pick("title"),
      published: pick("published"),
      author: authors.map((name) => ({ name })),
      summary: pick("summary") || undefined,
    }
  })
  return { entry: entries }
}

export function parseArxivPapers(value: unknown): readonly CitationPaper[] {
  const parsed = arxivResponseSchema.safeParse(value)
  if (!parsed.success) return []
  const entries = Array.isArray(parsed.data.entry) ? parsed.data.entry : [parsed.data.entry]
  return entries.flatMap((item) => {
    if (!item) return []
    const year = Number(item.published.slice(0, 4))
    const url = arxivHttpsUrl(item.id)
    const paper = citationPaperSchema.safeParse({
      paperId: url ?? item.id,
      title: item.title.replace(/\s+/gu, " ").trim(),
      authors: item.author.map((author) => author.name),
      year: Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : null,
      venue: "arXiv",
      abstract: item.summary ?? null,
      doi: null,
      url,
      openAccessUrl: url,
      citationCount: null,
    })
    return paper.success ? [paper.data] : []
  })
}

export function parseOpenAlexPapers(value: unknown): readonly CitationPaper[] {
  const parsed = z.object({ results: z.array(openAlexWorkSchema) }).safeParse(value)
  if (!parsed.success) return []
  return parsed.data.results.flatMap((item) => {
    const doi = normalizedDoi(item.doi)
    const paper = citationPaperSchema.safeParse({
      paperId: item.id,
      title: item.title.replace(/\s+/gu, " ").trim(),
      authors: item.authorships.flatMap((authorship) =>
        authorship.author.display_name ? [authorship.author.display_name] : [],
      ),
      year: item.publication_year ?? null,
      venue: item.primary_location?.source?.display_name ?? "OpenAlex",
      abstract: null,
      doi,
      url: item.doi && isHttpsUrl(item.doi) ? item.doi : null,
      openAccessUrl: null,
      citationCount: item.cited_by_count ?? null,
    })
    return paper.success ? [paper.data] : []
  })
}
