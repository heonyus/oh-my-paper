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

  it("restates an overview task after the whole paper, and only for the overview", () => {
    for (const action of ["keywords", "three_line_summary", "paper_summary"] as const) {
      const input = userInputFor({ ...request, action, paperContext: "x".repeat(200_000) })
      const task = input.slice(input.lastIndexOf("<TASK>"))

      expect(input.indexOf("<TASK>")).toBeGreaterThan(input.indexOf("</PAPER_CONTEXT>"))
      expect(input.endsWith("</TASK>")).toBe(true)
      expect(systemPromptFor(action)).toContain(task.slice("<TASK>\n".length, -"\n</TASK>".length))
    }
    for (const action of ["figure", "chat", "translation"] as const)
      expect(userInputFor({ ...request, action })).not.toContain("<TASK>")
  })

  it("keeps overview answers to their own format", () => {
    expect(systemPromptFor("keywords")).toContain("Return only five Markdown bullets")
    expect(systemPromptFor("three_line_summary")).toContain("Return only three")
    expect(systemPromptFor("paper_summary")).toContain("no heading")
    expect(systemPromptFor("paper_summary")).toContain("Never write HTML tags")
  })

  it("uses the delimiter protocol for the dedicated Hy-MT2 translator", () => {
    expect(systemPromptForRequest("page_translation", "tencent/hy-mt2-1.8b")).toContain(
      "@@BLOCK_ID@@",
    )
    expect(systemPromptForRequest("page_translation", "deepseek/deepseek-v4.1-flash")).toContain(
      "return JSON only",
    )
  })

  it("glosses only a key concept once and keeps field terms in English", () => {
    for (const model of [
      "tencent/hy-mt2-30b-a3b",
      "tencent/hy-mt2-7b",
      "qwen/qwen3-30b-a3b-instruct-2507",
      undefined,
    ]) {
      const prompt = systemPromptForRequest("page_translation", model)
      expect(prompt).toContain("`한국어(English)` at its first appearance in this request")
      expect(prompt).toContain("stays in English exactly as written")
      expect(prompt).not.toContain("first appearance in a block")
    }
  })

  it("gives translations a translator base without the reader's headings and caveats", () => {
    for (const prompt of [
      systemPromptFor("translation"),
      systemPromptFor("page_translation"),
      systemPromptForRequest("page_translation", "tencent/hy-mt2-7b"),
    ]) {
      expect(prompt).toContain("한다체")
      expect(prompt).not.toContain("descriptive headings")
      expect(prompt).not.toContain("확인 필요")
    }
    expect(systemPromptFor("figure")).toContain("descriptive headings")
  })
})
