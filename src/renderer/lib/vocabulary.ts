import type { BoardCard, CardId, DocumentId, DocumentRecord } from "../types"
import { shortEnglishSelection, translationMeanings } from "./cardPresentation"
import { interruptedCardBody } from "./structureCardState"

/** One place a word was looked up: the paper, the page, and the passage it sat in. */
export type VocabularySource = {
  readonly cardId: CardId
  readonly documentId: DocumentId
  readonly documentTitle: string
  readonly page: number
  readonly quote: string
}

/** A word and everything learned about it across the library, in the order it was met. */
export type VocabularyEntry = {
  /** The word as it was first selected, so the list keeps the reader's casing. */
  readonly word: string
  /** The word lowercased: the same word from two papers is one entry. */
  readonly key: string
  readonly meanings: readonly string[]
  readonly sources: readonly VocabularySource[]
}

export type VocabularySort = "alphabetical" | "paper"

/** A translation card that looked up a word or a short phrase, and received its meanings. */
export function isWordTranslation(card: BoardCard): boolean {
  if (card.kind !== "translation" || card.loading || card.body === interruptedCardBody) return false
  return shortEnglishSelection(card.anchor.quote) && translationMeanings(card.body).length > 0
}

function vocabularyKey(word: string): string {
  return word.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en")
}

/**
 * The library's vocabulary: every word translation on every paper, the same word merged into
 * one entry with the meanings from each lookup. Papers come in library order, pages in
 * reading order, so the list reads as the papers were read.
 */
export function buildVocabulary(
  cards: readonly BoardCard[],
  documents: readonly DocumentRecord[],
): readonly VocabularyEntry[] {
  const order = new Map(documents.map((document, index) => [document.id, index]))
  const titles = new Map(documents.map((document) => [document.id, document.title]))
  const sorted = cards
    .filter((card) => isWordTranslation(card) && order.has(card.documentId))
    .sort(
      (left, right) =>
        (order.get(left.documentId) ?? 0) - (order.get(right.documentId) ?? 0) ||
        left.anchor.page - right.anchor.page ||
        left.anchor.y - right.anchor.y,
    )
  const entries = new Map<string, VocabularyEntry>()
  for (const card of sorted) {
    const word = card.title.trim()
    const key = vocabularyKey(word)
    const source: VocabularySource = {
      cardId: card.id,
      documentId: card.documentId,
      documentTitle: titles.get(card.documentId) ?? "",
      page: card.anchor.page,
      quote: card.anchor.quote.trim(),
    }
    const existing = entries.get(key)
    const meanings = translationMeanings(card.body)
    if (!existing) {
      entries.set(key, { word, key, meanings, sources: [source] })
      continue
    }
    entries.set(key, {
      ...existing,
      meanings: [...existing.meanings, ...meanings.filter((m) => !existing.meanings.includes(m))],
      sources: [...existing.sources, source],
    })
  }
  return [...entries.values()]
}

/** Entries whose word, meanings, or source paper mention the query; everything when it is blank. */
export function filterVocabulary(
  entries: readonly VocabularyEntry[],
  query: string,
): readonly VocabularyEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return entries
  return entries.filter(
    (entry) =>
      entry.key.includes(needle) ||
      entry.meanings.some((meaning) => meaning.toLocaleLowerCase().includes(needle)) ||
      entry.sources.some((source) => source.documentTitle.toLocaleLowerCase().includes(needle)),
  )
}

export function sortVocabulary(
  entries: readonly VocabularyEntry[],
  sort: VocabularySort,
): readonly VocabularyEntry[] {
  if (sort === "paper") return entries
  return [...entries].sort((left, right) => left.key.localeCompare(right.key, "en"))
}

/** The papers the entries came from, each with its words, for the list grouped by paper. */
export function vocabularyByPaper(entries: readonly VocabularyEntry[]): readonly {
  readonly documentId: DocumentId
  readonly documentTitle: string
  readonly entries: readonly VocabularyEntry[]
}[] {
  const groups = new Map<
    DocumentId,
    { documentId: DocumentId; documentTitle: string; entries: VocabularyEntry[] }
  >()
  for (const entry of entries) {
    const first = entry.sources[0]
    if (!first) continue
    const group = groups.get(first.documentId) ?? {
      documentId: first.documentId,
      documentTitle: first.documentTitle,
      entries: [],
    }
    group.entries.push(entry)
    groups.set(first.documentId, group)
  }
  return [...groups.values()]
}

function sourceLabel(source: VocabularySource): string {
  return `${source.documentTitle} p.${source.page}`
}

function markdownCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\s+/gu, " ").trim()
}

/** A Markdown table of the entries: word, meanings, and where each was met. */
export function vocabularyMarkdown(
  entries: readonly VocabularyEntry[],
  headings: { readonly word: string; readonly meanings: string; readonly sources: string },
): string {
  const rows = entries.map((entry) =>
    [
      `**${markdownCell(entry.word)}**`,
      markdownCell(entry.meanings.join(", ")),
      markdownCell(entry.sources.map(sourceLabel).join("; ")),
    ].join(" | "),
  )
  return [
    `| ${headings.word} | ${headings.meanings} | ${headings.sources} |`,
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n")
}

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value
}

/**
 * Comma-separated rows of word, meanings, and sources; meanings are joined with a semicolon so a
 * flashcard app can take the row as a front and a back.
 */
export function vocabularyCsv(
  entries: readonly VocabularyEntry[],
  headings: { readonly word: string; readonly meanings: string; readonly sources: string },
): string {
  const rows = entries.map((entry) =>
    [entry.word, entry.meanings.join("; "), entry.sources.map(sourceLabel).join("; ")]
      .map(csvCell)
      .join(","),
  )
  return [
    [headings.word, headings.meanings, headings.sources].map(csvCell).join(","),
    ...rows,
  ].join("\n")
}
