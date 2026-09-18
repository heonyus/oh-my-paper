import { z } from "zod"
import {
  type BibliographyMetadata,
  bibliographyMetadataSchema,
  citationKeySchema,
} from "../shared/bibliographySchemas"
import type { KnowledgeNode } from "../shared/knowledgeTypes"

const storedMetadataSchema = z
  .object({
    authors: z.array(z.string()).optional(),
    creators: z.array(z.string()).optional(),
    year: z.number().int().nullable().optional(),
    date: z.string().optional(),
    doi: z.string().nullable().optional(),
    arxivId: z.string().nullable().optional(),
    identity: z.object({ arxivId: z.string().nullable().optional() }).optional(),
    venue: z.string().optional(),
    tags: z.array(z.string()).optional(),
    readingState: z.enum(["unread", "reading", "read"]).optional(),
    citationKey: z.string().optional(),
    fullTextReviewed: z.boolean().optional(),
  })
  .passthrough()

function uniqueTrimmed(values: readonly string[], limit: number): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

export function normalizeDoi(value: string | null): string | null {
  if (!value) return null
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .replace(/^doi:\s*/iu, "")
    .toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export function normalizeArxivId(value: string | null): string | null {
  if (!value) return null
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//iu, "")
    .replace(/\.pdf$/iu, "")
    .replace(/^arxiv:\s*/iu, "")
    .toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function safeToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/gu, "")
    .toLowerCase()
}

export function citationKeyBase(
  authors: readonly string[],
  year: number | null,
  title: string,
): string {
  const authorParts = authors[0]?.trim().split(/\s+/u) ?? []
  const author = safeToken(authorParts.at(-1) ?? "") || "paper"
  const titleWord = title
    .split(/\s+/u)
    .map(safeToken)
    .find((word) => word.length > 2)
  return `${author}${year ?? "nd"}${titleWord ?? "work"}`.slice(0, 72)
}

export function metadataFromNode(node: KnowledgeNode): BibliographyMetadata {
  const parsed = storedMetadataSchema.safeParse(node.metadata)
  const stored = parsed.success ? parsed.data : {}
  const yearFromDate = stored.date?.match(/(?:^|\D)(\d{4})(?:\D|$)/u)?.[1]
  const year = stored.year ?? (yearFromDate ? Number(yearFromDate) : null)
  const authors = uniqueTrimmed(stored.authors ?? stored.creators ?? [], 64)
  const generatedKey = citationKeyBase(authors, year, node.title)
  const parsedKey = citationKeySchema.safeParse(stored.citationKey)
  return bibliographyMetadataSchema.parse({
    citationKey: parsedKey.success ? parsedKey.data : generatedKey,
    authors,
    year,
    doi: normalizeDoi(stored.doi ?? null),
    arxivId: normalizeArxivId(stored.arxivId ?? stored.identity?.arxivId ?? null),
    venue: stored.venue ?? "",
    tags: uniqueTrimmed(stored.tags ?? [], 64),
    readingState: stored.readingState ?? (stored.fullTextReviewed ? "read" : "unread"),
  })
}

export function storedCitationKey(node: KnowledgeNode): string | null {
  const parsed = storedMetadataSchema.safeParse(node.metadata)
  if (!parsed.success) return null
  const key = citationKeySchema.safeParse(parsed.data.citationKey)
  return key.success ? key.data : null
}

export function normalizedList(values: readonly string[], limit = 64): readonly string[] {
  return uniqueTrimmed(values, limit)
}

export function escapeBibtex(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/\{/gu, "\\{").replace(/\}/gu, "\\}")
}
