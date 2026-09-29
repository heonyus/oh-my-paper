import { z } from "zod"
import type { ClaudeEffort } from "../shared/claudeTypes"
import { parseJsonObject } from "./agentCompletion"
import type { ClaudeCompletionOptions } from "./claudeCliCompletion"
import { PaperSourceError } from "./paperSourceHttp"
import { ProviderConfigurationError } from "./providerConfigStore"
import type { WebSearchEngine, WebSearchHit } from "./webSearchEngines"

/** The slice of the Claude subscription adapter a web search needs. */
export type ClaudeWebSearchRunner = {
  readonly runCompletion: (options: ClaudeCompletionOptions) => Promise<string>
}

export type ClaudeWebSearchSettings = {
  readonly model: string
  readonly effort?: ClaudeEffort | undefined
}

const maxTurns = 8
const timeoutMs = 120_000

const resultsSchema = z.object({
  results: z
    .array(z.object({ title: z.string(), url: z.string(), snippet: z.string() }))
    .default([]),
})

export const claudeWebSearchJsonSchema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          snippet: { type: "string" },
        },
        required: ["title", "url", "snippet"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const

const systemPrompt = [
  "You are the web search step of an academic paper finder. Use the WebSearch tool, in English",
  "and more than once if the first results are poor, to find web pages about the request. Then",
  "return only the structured result: the most relevant pages, best first, each with the page",
  "title, its exact URL and a one-sentence snippet. Prefer pages that identify specific papers:",
  "arxiv.org abstracts, openreview.net, DOI links, publisher and conference pages, and official",
  "code repositories. Only return URLs that appeared in search results; never invent one.",
].join(" ")

/** Titled http(s) hits from the CLI's structured answer, best first. */
export function parseClaudeWebSearchHits(text: string): WebSearchHit[] {
  const parsed = resultsSchema.safeParse(parseJsonObject(text))
  if (!parsed.success) throw new PaperSourceError("malformed")
  const hits: WebSearchHit[] = []
  for (const result of parsed.data.results) {
    const title = result.title.replace(/\s+/gu, " ").trim()
    const url = result.url.trim()
    if (!title || !/^https?:\/\//iu.test(url)) continue
    const snippet = result.snippet.replace(/\s+/gu, " ").trim()
    hits.push({ title, url, snippet: snippet || null })
  }
  return hits
}

/**
 * Web search through the locally installed Claude Code CLI's WebSearch tool, on the user's own
 * subscription. One call is an agentic turn of roughly half a minute, so the research agent
 * uses it as a fallback rather than per keyword query.
 */
export function createClaudeWebSearchEngine(deps: {
  readonly claude: ClaudeWebSearchRunner
  readonly settings: () => ClaudeWebSearchSettings
}): WebSearchEngine {
  return {
    label: "웹(Claude)",
    search: async (query, limit, signal) => {
      const settings = deps.settings()
      const wanted = Math.max(limit, 1)
      let text: string
      try {
        text = await deps.claude.runCompletion({
          systemPrompt,
          prompt: `Request:\n${query.slice(0, 1_000)}\n\nReturn up to ${wanted} results.`,
          model: settings.model,
          effort: settings.effort,
          jsonSchema: claudeWebSearchJsonSchema,
          tools: ["WebSearch"],
          maxTurns,
          signal,
          timeoutMs,
        })
      } catch (error) {
        if (error instanceof ProviderConfigurationError && error.kind === "rate_limited") {
          throw new PaperSourceError("rate_limited", 429)
        }
        throw error
      }
      return parseClaudeWebSearchHits(text).slice(0, wanted)
    },
  }
}
