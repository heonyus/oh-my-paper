import { describe, expect, it } from "vitest"
import { systemPromptFor, systemPromptForRequest, userInputFor } from "../../src/electron/aiPrompts"
import { aiActionSchema, aiRequestSchema } from "../../src/shared/ipc"

const request = aiRequestSchema.parse({
  action: "figure",
  documentId: "aabbccddeeff0011",
  page: 2,
  quote: "target",
  paperContext: "paper",
  sectionContext: "section",
  before: "before",
  after: "after",
  featureKind: "figure",
})

describe("research prompt routing contract", () => {
  it("resolves a non-empty distinct instruction for every parsed AI action", () => {
    const prompts = aiActionSchema.options.map(systemPromptFor)

    expect(prompts.every((prompt) => prompt.trim().length > 0)).toBe(true)
    expect(new Set(prompts)).toHaveLength(aiActionSchema.options.length)
  })

  it("serializes typed context slots in deterministic priority order", () => {
    const input = userInputFor(request)
    const tags = [
      "<CURRENT_PAGE>",
      "<PAPER_CONTEXT>",
      "<CURRENT_SECTION>",
      "<LOCAL_BEFORE>",
      "<USER_QUESTION_OR_TARGET>",
      "<LOCAL_AFTER>",
    ] as const
    const positions = tags.map((tag) => input.indexOf(tag))

    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(input).toContain("<USER_QUESTION_OR_TARGET>\ntarget\n</USER_QUESTION_OR_TARGET>")
  })

  it("uses the delimiter protocol for the dedicated Hy-MT2 translator", () => {
    expect(systemPromptForRequest("page_translation", "tencent/hy-mt2-1.8b")).toContain(
      "@@BLOCK_ID@@",
    )
    expect(systemPromptForRequest("page_translation", "deepseek/deepseek-v4.1-flash")).toContain(
      "return JSON only",
    )
  })

  it("keeps academic terms as English followed by a parenthesized Korean translation", () => {
    for (const model of [
      "tencent/hy-mt2-30b-a3b",
      "tencent/hy-mt2-7b",
      "qwen/qwen3-30b-a3b-instruct-2507",
      undefined,
    ]) {
      expect(systemPromptForRequest("page_translation", model)).toContain(
        "`English term(한국어 번역)`",
      )
    }
  })
})
