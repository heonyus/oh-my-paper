import type { BibliographyMap } from "./structureDetector"

export type CitationContext = {
  readonly page: number
  readonly text: string
}

export type CitationIndexEntry = {
  readonly key: string
  readonly title: string
  readonly authors: string
  readonly year: number | null
  readonly venue: string
  readonly rawText: string
  readonly doi: string | null
  readonly contexts: readonly CitationContext[]
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

function markerPattern(key: string): RegExp {
  if (/^\d+$/u.test(key)) {
    return new RegExp(`\\[(?:\\d+\\s*,\\s*)*${escaped(key)}(?:\\s*,\\s*\\d+)*\\]`, "gu")
  }
  const match = key.match(/^(.+)-(\d{4}[a-z]?)$/u)
  return match?.[1] && match[2]
    ? new RegExp(`${escaped(match[1])}[^.]{0,80}${escaped(match[2])}`, "giu")
    : new RegExp(escaped(key), "giu")
}

function contextsFor(key: string, pageTexts: readonly string[]): readonly CitationContext[] {
  const contexts: CitationContext[] = []
  for (const [index, pageText] of pageTexts.entries()) {
    for (const match of pageText.matchAll(markerPattern(key))) {
      if (match.index === undefined) continue
      const start = Math.max(0, match.index - 220)
      const end = Math.min(pageText.length, match.index + match[0].length + 220)
      const text = pageText.slice(start, end).replace(/\s+/gu, " ").trim()
      if (text && !contexts.some((context) => context.text === text)) {
        contexts.push({ page: index + 1, text })
      }
      if (contexts.length >= 4) return contexts
    }
  }
  return contexts
}

function doiFrom(rawText: string): string | null {
  return rawText.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/iu)?.[0] ?? null
}

export function buildCitationIndex(
  bibliography: BibliographyMap,
  pageTexts: readonly string[],
): readonly CitationIndexEntry[] {
  return Object.values(bibliography)
    .map((reference) => ({
      key: reference.key,
      title: reference.title,
      authors: reference.authors,
      year: reference.year,
      venue: reference.venue,
      rawText: reference.rawText,
      doi: doiFrom(reference.rawText),
      contexts: contextsFor(reference.key, pageTexts),
    }))
    .sort(
      (left, right) =>
        right.contexts.length - left.contexts.length || left.title.localeCompare(right.title),
    )
}
