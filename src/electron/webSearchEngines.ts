import { z } from "zod"
import { PaperSourceError, parseJsonBody, requestSource, sourcePacers } from "./paperSourceHttp"
import type { ScholarlyTransport } from "./scholarlySearchTransport"

export type WebSearchHit = {
  readonly title: string
  readonly url: string
  readonly snippet: string | null
}

/** A general web search engine whose hits the research agent mines for paper links. */
export type WebSearchEngine = {
  readonly label: string
  readonly search: (
    query: string,
    limit: number,
    signal?: AbortSignal,
  ) => Promise<readonly WebSearchHit[]>
}

const searxngResultSchema = z.object({
  title: z.string().nullable().optional(),
  url: z.string(),
  content: z.string().nullable().optional(),
})

const searxngResponseSchema = z.object({ results: z.array(z.unknown()).default([]) })

/** The base of a SearXNG instance (origin plus optional path prefix), or null when unusable. */
export function searxngBaseUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    const usable =
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    if (!usable) return null
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`
    return url
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}

/** Titled http(s) hits from a SearXNG `format=json` response, in the engine's order. */
export function parseSearxngHits(value: unknown): WebSearchHit[] {
  const envelope = searxngResponseSchema.safeParse(value)
  if (!envelope.success) throw new PaperSourceError("malformed")
  const hits: WebSearchHit[] = []
  for (const entry of envelope.data.results) {
    const parsed = searxngResultSchema.safeParse(entry)
    if (!parsed.success) continue
    const title = parsed.data.title?.replace(/\s+/gu, " ").trim() ?? ""
    const url = parsed.data.url.trim()
    if (!title || !/^https?:\/\//iu.test(url)) continue
    const snippet = parsed.data.content?.replace(/\s+/gu, " ").trim() ?? ""
    hits.push({ title, url, snippet: snippet || null })
  }
  return hits
}

/**
 * A SearXNG instance (open-source metasearch) whose `search.formats` includes `json`. Public
 * instances mostly disable that format or challenge automated clients, so this is meant for a
 * self-hosted one.
 */
export function createSearxngEngine(
  base: URL,
  options: { readonly transport?: ScholarlyTransport | undefined } = {},
): WebSearchEngine {
  return {
    label: "웹(SearXNG)",
    search: async (query, limit, signal) => {
      const url = new URL("search", base)
      url.searchParams.set("q", query.slice(0, 300))
      url.searchParams.set("format", "json")
      url.searchParams.set("language", "en")
      url.searchParams.set("categories", "general,science")
      url.searchParams.set("safesearch", "0")
      const body = await requestSource({
        url,
        pacer: sourcePacers.web,
        signal,
        transport: options.transport,
      })
      return parseSearxngHits(parseJsonBody(body)).slice(0, Math.max(limit, 1))
    },
  }
}
