import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { answerLanguage } from "../../src/electron/agentCompletion"
import { systemPromptFor, systemPromptForRequest, userInputFor } from "../../src/electron/aiPrompts"
import { parsedTranslationResponse } from "../../src/renderer/lib/cardPresentation"
import { currentLocale, LocaleProvider } from "../../src/renderer/lib/locale"
import { pageTranslationCacheIdentity } from "../../src/renderer/lib/pageTranslationCacheRuntime"
import { aiActionSchema, aiRequestSchema } from "../../src/shared/ipc"
import { documentIdSchema } from "../../src/shared/schemas"

const hangul = /[가-힣]/u

describe("AI answer language", () => {
  it("writes every English prompt in English and asks for English", () => {
    const prompts = aiActionSchema.options.map((action) =>
      systemPromptFor(action, { language: "en" }),
    )
    expect(new Set(prompts)).toHaveLength(aiActionSchema.options.length)
    for (const prompt of prompts) expect(prompt).not.toMatch(hangul)
    expect(systemPromptFor("chat", { language: "en" })).toContain("Answer in English")
    expect(systemPromptFor("three_line_summary", { language: "en" })).toContain(
      "`1. **Problem**: ...`",
    )
    expect(systemPromptFor("page_translation", { language: "en" })).toContain(
      '"markdown":"<English translation>"',
    )
    expect(
      systemPromptForRequest("page_translation", "tencent/hy-mt2-7b", { language: "en" }),
    ).toContain("Translate every supplied block into English")
  })

  it("keeps Korean answers in one register per surface", () => {
    expect(systemPromptFor("explanation")).toContain("한다체")
    expect(systemPromptFor("keywords")).toContain("한다체")
    expect(systemPromptFor("chat")).toContain("합쇼체")
    expect(systemPromptFor("note_tutor")).toContain("해요체")
  })

  it("keeps long-form rules out of short formats", () => {
    for (const action of ["keywords", "three_line_summary", "card_title", "note_tutor"] as const)
      expect(systemPromptFor(action)).not.toContain("descriptive headings")
    expect(systemPromptFor("explanation")).toContain("descriptive headings")
  })

  it("names the document type in the system prompt", () => {
    expect(systemPromptFor("explanation", { documentKind: "contract" })).toContain(
      "The document is a contract or policy",
    )
    expect(systemPromptFor("explanation", { documentKind: "contract" })).toContain(
      "문서 전체에서의 역할",
    )
    expect(systemPromptFor("explanation", { documentKind: "research_paper" })).toContain(
      "논문 전체에서의 역할",
    )
  })

  it("restates the overview task in the request's language", () => {
    const request = aiRequestSchema.parse({
      action: "keywords",
      documentId: "aabbccddeeff0011",
      page: 1,
      quote: "The whole paper supplied in PAPER_CONTEXT.",
      before: "",
      after: "",
      language: "en",
    })
    expect(userInputFor(request)).toContain("one English sentence")
  })

  it("answers research questions in the app's language when it is given", () => {
    expect(answerLanguage("what is RAG?", "ko")).toBe("Korean")
    expect(answerLanguage("RAG가 뭐야?", "en")).toBe("English")
    expect(answerLanguage("RAG가 뭐야?")).toBe("Korean")
  })

  it("keys page translations by the app's language", () => {
    const documentId = documentIdSchema.parse("aabbccddeeff0011")
    const provider = { configured: true, provider: "anthropic", model: "claude-haiku-4-5" } as const
    render(<LocaleProvider initialPreference="en">x</LocaleProvider>)
    expect(currentLocale()).toBe("en")
    expect(pageTranslationCacheIdentity(documentId, 3, provider)).toContain(":3:en:")
    render(<LocaleProvider initialPreference="ko">x</LocaleProvider>)
    expect(pageTranslationCacheIdentity(documentId, 3, provider)).toContain(":3:ko:")
  })

  it("reads word meanings wrapped in a code fence", () => {
    const parsed = parsedTranslationResponse(
      '```json\n{"meanings":["assumption","premise"]}\n```',
      "hypothesis",
    )
    expect(parsed.body).toBe("1. **assumption**\n2. premise")
  })
})
