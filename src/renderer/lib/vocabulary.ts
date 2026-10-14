import type {
  BoardCard,
  CardId,
  DocumentId,
  DocumentRecord,
  SourceAnchor,
  Workspace,
} from "../types"
import { shortEnglishSelection, translationMeanings } from "./cardPresentation"
import { interruptedCardBody } from "./structureCardState"

/** A word's example sentence and that sentence translated. */
export type VocabularyExample = { readonly sentence: string; readonly translation: string }

/** One place a word was looked up: the paper, the page, the passage, and when. */
export type VocabularySource = {
  readonly cardId: CardId
  readonly documentId: DocumentId
  readonly documentTitle: string
  readonly page: number
  readonly quote: string
  readonly anchor: SourceAnchor
  /** When the lookup was first saved; null for a card not saved yet. */
  readonly createdAt: string | null
  /** The example sentence and its translation, once one was made and kept on the card. */
  readonly example: VocabularyExample | null
}

/** A word and everything learned about it across the library, in the order it was met. */
export type VocabularyEntry = {
  /** The word as it was first selected, so the list keeps the reader's casing. */
  readonly word: string
  /** The word lowercased: the same word from two papers is one entry. */
  readonly key: string
  readonly meanings: readonly string[]
  readonly sources: readonly VocabularySource[]
  /** The latest of its lookups, for the list in the order words were met. */
  readonly lastSeenAt: string | null
}

export type VocabularySort = "recent" | "alphabetical" | "paper"

/** A translation card that looked up a word or a short phrase, and received its meanings. */
export function isWordTranslation(card: BoardCard): boolean {
  if (card.kind !== "translation" || card.loading || card.body === interruptedCardBody) return false
  return shortEnglishSelection(card.anchor.quote) && translationMeanings(card.body).length > 0
}

/** A workspace update keeping a translated example on its word card. */
export function withCardExample(
  cardId: CardId,
  example: VocabularyExample,
): (workspace: Workspace | null) => Workspace | null {
  return (workspace) =>
    workspace && {
      ...workspace,
      cards: workspace.cards.map((card) => (card.id === cardId ? { ...card, example } : card)),
    }
}

function later(left: string | null, right: string | null): string | null {
  if (left === null) return right
  if (right === null) return left
  return left > right ? left : right
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
      anchor: card.anchor,
      createdAt: card.createdAt ?? null,
      example: card.example ?? null,
    }
    const existing = entries.get(key)
    const meanings = translationMeanings(card.body)
    if (!existing) {
      entries.set(key, { word, key, meanings, sources: [source], lastSeenAt: source.createdAt })
      continue
    }
    entries.set(key, {
      ...existing,
      meanings: [...existing.meanings, ...meanings.filter((m) => !existing.meanings.includes(m))],
      sources: [...existing.sources, source],
      lastSeenAt: later(existing.lastSeenAt, source.createdAt),
    })
  }
  return [...entries.values()]
}

/**
 * Entries whose word, meanings, source paper or kept example mention the query; everything when
 * it is blank.
 */
export function filterVocabulary(
  entries: readonly VocabularyEntry[],
  query: string,
): readonly VocabularyEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return entries
  const mentions = (value: string): boolean => value.toLocaleLowerCase().includes(needle)
  return entries.filter(
    (entry) =>
      entry.key.includes(needle) ||
      entry.meanings.some(mentions) ||
      entry.sources.some(
        (source) =>
          mentions(source.documentTitle) ||
          (source.example !== null &&
            (mentions(source.example.sentence) || mentions(source.example.translation))),
      ),
  )
}

export function sortVocabulary(
  entries: readonly VocabularyEntry[],
  sort: VocabularySort,
): readonly VocabularyEntry[] {
  if (sort === "paper") return entries
  if (sort === "recent")
    return [...entries].sort((left, right) =>
      (right.lastSeenAt ?? "").localeCompare(left.lastSeenAt ?? ""),
    )
  return [...entries].sort((left, right) => left.key.localeCompare(right.key, "en"))
}

/** The local calendar day of an ISO time, as `YYYY-MM-DD`; null for no time. */
export function vocabularyDay(iso: string | null): string | null {
  if (iso === null) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Entries, already in order, gathered under the day each was last met; undated ones last. */
export function vocabularyByDay(entries: readonly VocabularyEntry[]): readonly {
  readonly day: string | null
  readonly entries: readonly VocabularyEntry[]
}[] {
  const groups = new Map<string | null, VocabularyEntry[]>()
  for (const entry of entries) {
    const day = vocabularyDay(entry.lastSeenAt)
    groups.set(day, [...(groups.get(day) ?? []), entry])
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left === null ? 1 : right === null ? -1 : 0))
    .map(([day, grouped]) => ({ day, entries: grouped }))
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

/** The columns an export writes, named in the reader's language. */
export type VocabularyHeadings = {
  readonly word: string
  readonly meanings: string
  readonly example: string
  readonly translation: string
  readonly sources: string
}

/** The example of a source an export writes: kept on the card, or found in the paper. */
export type VocabularyExampleOf = (source: VocabularySource) => {
  readonly sentence: string
  readonly translation: string | null
} | null

function sourceLabel(source: VocabularySource): string {
  const day = vocabularyDay(source.createdAt)
  return `${source.documentTitle} p.${source.page}${day ? ` (${day})` : ""}`
}

/** The columns of one entry: its first source with an example gives the example. */
function exportRow(entry: VocabularyEntry, exampleOf: VocabularyExampleOf): readonly string[] {
  const example = entry.sources.map(exampleOf).find((found) => found !== null) ?? null
  return [
    entry.word,
    entry.meanings.join("; "),
    example?.sentence ?? "",
    example?.translation ?? "",
    entry.sources.map(sourceLabel).join("; "),
  ]
}

function markdownCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\s+/gu, " ").trim()
}

/** A Markdown table of the entries: word, meanings, example and its translation, and sources. */
export function vocabularyMarkdown(
  entries: readonly VocabularyEntry[],
  headings: VocabularyHeadings,
  exampleOf: VocabularyExampleOf,
): string {
  const columns = [
    headings.word,
    headings.meanings,
    headings.example,
    headings.translation,
    headings.sources,
  ]
  const rows = entries.map((entry) => {
    const [word = "", ...rest] = exportRow(entry, exampleOf).map(markdownCell)
    return [`**${word}**`, ...rest].join(" | ")
  })
  return [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row} |`),
  ].join("\n")
}

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value
}

/**
 * Comma-separated rows of word, meanings, example, its translation and sources; meanings are
 * joined with a semicolon so a flashcard app can take the row as a front and a back.
 */
export function vocabularyCsv(
  entries: readonly VocabularyEntry[],
  headings: VocabularyHeadings,
  exampleOf: VocabularyExampleOf,
): string {
  return [
    [headings.word, headings.meanings, headings.example, headings.translation, headings.sources],
    ...entries.map((entry) => exportRow(entry, exampleOf)),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")
}
