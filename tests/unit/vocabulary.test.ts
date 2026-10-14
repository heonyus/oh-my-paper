import { describe, expect, it } from "vitest"
import {
  buildVocabulary,
  filterVocabulary,
  isWordTranslation,
  sortVocabulary,
  vocabularyByPaper,
  vocabularyCsv,
  vocabularyMarkdown,
} from "../../src/renderer/lib/vocabulary"
import { boardCardSchema, documentRecordSchema } from "../../src/shared/schemas"

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

  it("writes a Markdown table and CSV rows that a flashcard app can take", () => {
    const entries = buildVocabulary([indicates, indicatesAgain], [paperA, paperB])
    const headings = { word: "단어", meanings: "뜻", sources: "출처" }
    expect(vocabularyMarkdown(entries, headings)).toBe(
      [
        "| 단어 | 뜻 | 출처 |",
        "| --- | --- | --- |",
        `| **indicates** | 나타내다, 시사하다, 가리키다 | ${paperA.title} p.3; ${paperB.title} p.5 |`,
      ].join("\n"),
    )
    expect(vocabularyCsv(entries, headings)).toBe(
      [
        "단어,뜻,출처",
        `indicates,나타내다; 시사하다; 가리키다,"${paperA.title} p.3; ${paperB.title} p.5"`,
      ].join("\n"),
    )
  })
})
