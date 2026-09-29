// @vitest-environment node

import { describe, expect, it } from "vitest"
import type { ClaudeCompletionOptions } from "../../src/electron/claudeCliCompletion"
import {
  claudeWebSearchJsonSchema,
  createClaudeWebSearchEngine,
} from "../../src/electron/claudeWebSearch"
import { ProviderConfigurationError } from "../../src/electron/providerConfigStore"

function engineWith(runCompletion: (options: ClaudeCompletionOptions) => Promise<string>) {
  return createClaudeWebSearchEngine({
    claude: { runCompletion },
    settings: () => ({ model: "claude-sonnet-5-5", effort: "low" }),
  })
}

describe("Claude web search engine", () => {
  it("asks the CLI for a structured web search and keeps titled http hits", async () => {
    const calls: ClaudeCompletionOptions[] = []
    const engine = engineWith(async (options) => {
      calls.push(options)
      return JSON.stringify({
        results: [
          { title: " MedRSI ", url: "https://arxiv.org/abs/2609.24838", snippet: "A  paper" },
          { title: "", url: "https://untitled.example", snippet: "" },
          { title: "No scheme", url: "arxiv.org/abs/1", snippet: "" },
          { title: "Repo", url: "https://github.com/x/y", snippet: "" },
        ],
      })
    })
    const hits = await engine.search("medRSI 논문 찾아와", 5)
    expect(calls[0]).toMatchObject({
      model: "claude-sonnet-5-5",
      effort: "low",
      tools: ["WebSearch"],
      maxTurns: 8,
      jsonSchema: claudeWebSearchJsonSchema,
    })
    expect(calls[0]?.prompt).toContain("medRSI 논문 찾아와")
    expect(calls[0]?.prompt).toContain("up to 5 results")
    expect(hits).toEqual([
      { title: "MedRSI", url: "https://arxiv.org/abs/2609.24838", snippet: "A paper" },
      { title: "Repo", url: "https://github.com/x/y", snippet: null },
    ])
  })

  it("reports the CLI's rate limit as a source rate limit and passes other failures through", async () => {
    const limited = engineWith(async () => {
      throw new ProviderConfigurationError("rate_limited")
    })
    await expect(limited.search("q", 3)).rejects.toMatchObject({ kind: "rate_limited" })
    const cancelled = engineWith(async () => {
      throw new ProviderConfigurationError("cancelled")
    })
    await expect(cancelled.search("q", 3)).rejects.toBeInstanceOf(ProviderConfigurationError)
  })

  it("rejects an answer that is not a result list", async () => {
    const engine = engineWith(async () => "no json here")
    await expect(engine.search("q", 3)).rejects.toMatchObject({ kind: "malformed" })
  })
})
