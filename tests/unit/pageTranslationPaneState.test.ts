import { describe, expect, it } from "vitest"
import { isPlaceholderPageTranslation } from "../../src/renderer/lib/pageTranslationJson"
import {
  mergePageTranslations,
  pageTranslationFailureMessage,
  reusablePageTranslations,
} from "../../src/renderer/lib/pageTranslationPaneState"
import type { PageTranslationBlock } from "../../src/renderer/lib/pageTranslationSource"
import { PaperAiJobError } from "../../src/renderer/lib/usePaperAiRequest"

const blocks: readonly PageTranslationBlock[] = [
  { id: "p1-b1", kind: "heading", source: "Results", translation: "" },
  { id: "p1-b2", kind: "body", source: "The score improved.", translation: "" },
]

describe("mergePageTranslations", () => {
  it("returns the same array and block objects when no translation changed", () => {
    const seeded = mergePageTranslations(blocks, new Map([["p1-b1", "결과"]]))
    const merged = mergePageTranslations(seeded, new Map([["p1-b1", "결과"]]))

    expect(merged).toBe(seeded)
    expect(merged[0]).toBe(seeded[0])
    expect(merged[1]).toBe(seeded[1])
  })

  it("keeps references for untouched blocks while replacing the changed one", () => {
    const merged = mergePageTranslations(blocks, new Map([["p1-b2", "점수가 향상됐다."]]))

    expect(merged).not.toBe(blocks)
    expect(merged[0]).toBe(blocks[0])
    expect(merged[1]).not.toBe(blocks[1])
    expect(merged[1]?.translation).toBe("점수가 향상됐다.")
  })
})

describe("reusablePageTranslations", () => {
  const cached: readonly PageTranslationBlock[] = [
    {
      id: "b:3:sentence:1",
      kind: "body",
      source: "The score improved.",
      translation: "점수가 올랐다.",
    },
    {
      id: "b:4:sentence:1",
      kind: "body",
      source: "Preprint January 2024 Other work followed.",
      translation: "다른 연구가 뒤따랐다.",
    },
    {
      id: "b:5:sentence:1",
      kind: "body",
      source: "Other",
      translation:
        "제공된 입력에 번역할 원문 텍스트가 포함되어 있지 않아 번역을 수행할 수 없습니다.",
    },
  ]

  it("uses a cached page as it is only when it holds exactly the current units", () => {
    const same = cached.map(({ id, source }) => ({ id, source }))
    expect(reusablePageTranslations(cached.slice(0, 2), same.slice(0, 2)).complete).toBe(true)
    expect(reusablePageTranslations(cached, same).complete).toBe(false)
  })

  it("keeps the translation of every unchanged sentence, even after its block was renumbered", () => {
    const reused = reusablePageTranslations(cached, [
      { id: "b:4:sentence:1", source: "The score improved." },
      { id: "b:5:sentence:1", source: "Other work followed." },
      { id: "b:6:sentence:1", source: "Other" },
    ])

    expect([...reused.translations]).toEqual([["b:4:sentence:1", "점수가 올랐다."]])
    expect(reused.complete).toBe(false)
  })

  it("keeps the preferred of several earlier translations of the same sentence", () => {
    const current = [{ id: "b:3:sentence:1", source: "The score improved." }]
    const preferred = { ...cached[0], translation: "점수가 향상되었다." } as PageTranslationBlock
    const older = { ...cached[0], id: "b:9:sentence:1" } as PageTranslationBlock

    expect(
      reusablePageTranslations([preferred, cached[0] as PageTranslationBlock], current)
        .translations,
    ).toEqual(new Map([["b:3:sentence:1", "점수가 향상되었다."]]))
    // Matched by its source text alone, the first translation listed still wins.
    expect(
      reusablePageTranslations([{ ...preferred, id: "b:8:sentence:1" }, older], current)
        .translations,
    ).toEqual(new Map([["b:3:sentence:1", "점수가 향상되었다."]]))
  })

  it("treats a model's note that there was nothing to translate as no translation", () => {
    expect(
      isPlaceholderPageTranslation("제공된 입력에 번역할 원문 텍스트가 포함되어 있지 않습니다."),
    ).toBe(true)
    expect(isPlaceholderPageTranslation("그 외에는")).toBe(false)
  })
})

describe("pageTranslationFailureMessage", () => {
  it("names the cause of a failed AI job so the reader knows what to do", () => {
    expect(pageTranslationFailureMessage(new PaperAiJobError("timeout"))).toBe(
      "AI 응답이 제한 시간 안에 오지 않았습니다.",
    )
    expect(pageTranslationFailureMessage(new PaperAiJobError("auth"))).toContain("로그인")
    expect(pageTranslationFailureMessage(new PaperAiJobError("rate_limited"))).toContain("한도")
    expect(pageTranslationFailureMessage(new PaperAiJobError("provider_error"))).toBe(
      "AI 응답을 받지 못했습니다.",
    )
  })

  it("adds nothing for an error that is not an AI job failure", () => {
    expect(pageTranslationFailureMessage(new Error("missing page translation block b0"))).toBeNull()
  })
})
