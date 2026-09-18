import { describe, expect, it } from "vitest"
import { systemPromptFor, userInputFor } from "../../src/electron/aiPrompts"
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
})
