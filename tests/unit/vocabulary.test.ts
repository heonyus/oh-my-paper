import { describe, expect, it } from "vitest"
import {
  buildVocabulary,
  filterVocabulary,
  isWordTranslation,
  sortVocabulary,
  type VocabularyExampleOf,
  vocabularyByDay,
  vocabularyByPaper,
  vocabularyCsv,
  vocabularyMarkdown,
  withCardExample,
} from "../../src/renderer/lib/vocabulary"
import { boardCardSchema, documentRecordSchema, type Workspace } from "../../src/shared/schemas"

const paperA = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "circulatory.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-30T00:00:00.000Z",
  pageCount: 12,
  title: "Early prediction of circulatory failure",
  authors: [],
  year: 2020,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 4000, needsOcr: false, warnings: [] },
})
const paperB = documentRecordSchema.parse({
  ...paperA,
  id: "bbccddeeff001122",
  name: "imputation.pdf",
  hash: "b".repeat(64),
  title: "Time series imputation, a survey",
})

let cardCount = 0
function card(
  documentId: string,
  quote: string,
  body: string,
  page: number,
  overrides: Record<string, unknown> = {},
) {
  cardCount += 1
  return boardCardSchema.parse({
    id: `00000000-0000-4000-8000-${String(cardCount).padStart(12, "0")}`,
    documentId,
    kind: "translation",
    title: quote,
    body,
    x: 0,
    y: page * 10,
    minimized: false,
    loading: false,
    chat: [],
    anchor: { page, quote, x: 0, y: page * 10, fragments: [{ x: 0, y: 0, width: 1, height: 1 }] },
    ...overrides,
  })
}

const indicates = card(paperA.id, "indicates", "1. **나타내다**\n2. 시사하다", 3)
const otherwise = card(paperA.id, "Otherwise", "1. **그렇지 않으면**", 2)
const indicatesAgain = card(paperB.id, "Indicates", "1. **가리키다**\n2. 나타내다", 5)
const paragraph = card(
  paperA.id,
  "We linearly interpolated lactate values between measurements.",
  "측정 사이의 젖산 값을 선형 보간했다.",
  4,
  { title: "문단 번역" },
)
const loading = card(paperA.id, "vice versa", "", 1, { loading: true })
const strayPaper = card("ccddeeff00112233", "stray", "1. **길 잃은**", 1)

describe("vocabulary", () => {
  it("keeps word translations and leaves paragraphs and unfinished lookups out", () => {
    expect(isWordTranslation(indicates)).toBe(true)
    expect(isWordTranslation(paragraph)).toBe(false)
    expect(isWordTranslation(loading)).toBe(false)
  })

  it("merges the same word across papers, in reading order, with every source", () => {
    const entries = buildVocabulary(
      [indicatesAgain, indicates, paragraph, otherwise, loading, strayPaper],
      [paperA, paperB],
    )
    expect(entries.map((entry) => entry.word)).toEqual(["Otherwise", "indicates"])
    const merged = entries[1]
    expect(merged?.meanings).toEqual(["나타내다", "시사하다", "가리키다"])
    expect(merged?.sources.map((source) => [source.documentTitle, source.page])).toEqual([
      [paperA.title, 3],
      [paperB.title, 5],
    ])
  })

  it("searches words, meanings, and paper titles, and sorts alphabetically on request", () => {
    const entries = buildVocabulary([indicates, otherwise, indicatesAgain], [paperA, paperB])
    expect(filterVocabulary(entries, "시사").map((entry) => entry.word)).toEqual(["indicates"])
    expect(filterVocabulary(entries, "survey").map((entry) => entry.word)).toEqual(["indicates"])
    expect(filterVocabulary(entries, "  ").length).toBe(2)
    expect(sortVocabulary(entries, "alphabetical").map((entry) => entry.word)).toEqual([
      "indicates",
      "Otherwise",
    ])
    expect(vocabularyByPaper(entries).map((group) => group.documentTitle)).toEqual([paperA.title])
  })

  it("keeps when each word was met, lists the latest first and gathers them by day", () => {
    const early = card(paperA.id, "indicates", "1. **나타내다**", 3, {
      createdAt: "2026-10-12T01:00:00.000Z",
    })
    const late = card(paperB.id, "indicates", "1. **가리키다**", 5, {
      createdAt: "2026-10-14T09:30:00.000Z",
    })
    const middle = card(paperA.id, "Otherwise", "1. **그렇지 않으면**", 2, {
      createdAt: "2026-10-13T04:00:00.000Z",
    })
    const unsaved = card(paperA.id, "albeit", "1. **비록**", 6)
    const entries = buildVocabulary([early, late, middle, unsaved], [paperA, paperB])
    expect(entries.find((entry) => entry.word === "indicates")?.lastSeenAt).toBe(
      "2026-10-14T09:30:00.000Z",
    )
    const recent = sortVocabulary(entries, "recent")
    expect(recent.map((entry) => entry.word)).toEqual(["indicates", "Otherwise", "albeit"])
    const days = vocabularyByDay(recent)
    expect(days.map((day) => day.entries.map((entry) => entry.word))).toEqual([
      ["indicates"],
      ["Otherwise"],
      ["albeit"],
    ])
    expect(days.at(-1)?.day).toBeNull()
  })

  it("searches the kept example and keeps a translated example on its card", () => {
    const kept = card(paperA.id, "indicates", "1. **나타내다**", 3, {
      example: {
        sentence: "This indicates that perfusion was failing early.",
        translation: "이는 관류가 일찍 나빠지고 있었음을 나타낸다.",
      },
    })
    const entries = buildVocabulary([kept, otherwise], [paperA])
    expect(filterVocabulary(entries, "perfusion").map((entry) => entry.word)).toEqual(["indicates"])
    expect(filterVocabulary(entries, "관류").map((entry) => entry.word)).toEqual(["indicates"])
    // Only the cards matter to the update.
    const workspace = { cards: [indicates, otherwise] } as unknown as Workspace
    const example = { sentence: "This indicates it.", translation: "이는 그것을 나타낸다." }
    const updated = withCardExample(indicates.id, example)(workspace)
    expect(updated?.cards.find((item) => item.id === indicates.id)?.example).toEqual(example)
    expect(updated?.cards.find((item) => item.id === otherwise.id)?.example).toBeUndefined()
  })

  it("writes a Markdown table and CSV rows that a flashcard app can take", () => {
    const dated = card(paperA.id, "indicates", "1. **나타내다**\n2. 시사하다", 3, {
      createdAt: "2026-10-14T09:30:00.000Z",
    })
    const entries = buildVocabulary([dated, indicatesAgain], [paperA, paperB])
    const headings = {
      word: "단어",
      meanings: "뜻",
      example: "예문",
      translation: "해석",
      sources: "출처",
    }
    const exampleOf: VocabularyExampleOf = (source) =>
      source.page === 3
        ? { sentence: "This indicates failure.", translation: "이는 실패를 나타낸다." }
        : null
    const day = new Date("2026-10-14T09:30:00.000Z")
    const local = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
    const sources = `${paperA.title} p.3 (${local}); ${paperB.title} p.5`
    expect(vocabularyMarkdown(entries, headings, exampleOf)).toBe(
      [
        "| 단어 | 뜻 | 예문 | 해석 | 출처 |",
        "| --- | --- | --- | --- | --- |",
        `| **indicates** | 나타내다; 시사하다; 가리키다 | This indicates failure. | 이는 실패를 나타낸다. | ${sources} |`,
      ].join("\n"),
    )
    expect(vocabularyCsv(entries, headings, exampleOf)).toBe(
      [
        "단어,뜻,예문,해석,출처",
        `indicates,나타내다; 시사하다; 가리키다,This indicates failure.,이는 실패를 나타낸다.,"${sources}"`,
      ].join("\n"),
    )
  })
})
