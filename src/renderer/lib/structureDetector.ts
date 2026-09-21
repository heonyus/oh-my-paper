import type { SourceFragment } from "../../shared/schemas"

export type StructureKind = "section" | "figure" | "table" | "equation" | "citation"

export type ReferenceItem = {
  readonly key: string
  readonly title: string
  readonly authors: string
  readonly year: number | null
  readonly venue: string
  readonly rawText: string
  readonly url?: string
}

export type BibliographyMap = Readonly<Record<string, ReferenceItem>>

export type DetectedStructure = {
  readonly id: string
  readonly kind: StructureKind
  readonly page: number
  readonly title: string
  readonly quote: string
  readonly bounds: SourceFragment
  readonly reference?: ReferenceItem
}

export type LineItem = {
  readonly text: string
  readonly bounds: SourceFragment
}

const sectionPattern =
  /^\s*(\d+(?:\.\d+)*\.?|Abstract|Introduction|Related\s+Work|Methodology|Methods|Framework|Experiments|Results|Discussion|Conclusion|References)\b(?:\s+([A-Za-z0-9\s\-:,/]{2,80}))?/iu
const figurePattern = /^\s*(?:Figure|Fig\.?)\s*(\d+)[:.\s]\s*(.+)$/iu
const tablePattern = /^\s*(?:Table|Tab\.?)\s*(\d+)[:.\s]\s*(.+)$/iu
const equationPattern =
  /(?:Equation\s*\((\d+)\)|\((\d+)\)\s*$|[=≤≥≈∑∫∆θσμφ]\s*[A-Za-z0-9_+\-/*()^]+)/iu
const citationPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/gu

function bibliographySection(text: string): string {
  const spacedHeading = /\bR\s+E\s*F\s*E\s*R\s*E\s*N\s*C\s*E\s*S\b/u.exec(text)
  const plainHeading = [...text.matchAll(/\b(?:References|Bibliography)\b/giu)].at(-1)
  const heading = spacedHeading ?? plainHeading
  if (!heading || heading.index === undefined) return ""
  const afterHeading = text.slice(heading.index + heading[0].length)
  const appendix = /\b[A-Z]\s+[A-Z]\s+[A-Z]{3,}\b/u.exec(afterHeading)
  return (
    appendix?.index === undefined ? afterHeading : afterHeading.slice(0, appendix.index)
  ).trim()
}

const numberedReferencePattern = /(?:^|\s)(?:\[(\d{1,3})\]|(\d{1,3})\.)\s+/gu

function trimReferenceText(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/^[.\s]+|[.\s]+$/gu, "")
    .trim()
}

function bibliographyEntryBody(value: string): string {
  const visualMarker = value.match(/\s+(?:Figure|Fig\.?|Table|Tab\.?)\s+\d+\s*[:.]/iu)
  const authorYearMarker = [
    ...value.matchAll(/\s+(?=[A-Z][^.!?]{2,180}\.\s+(?:19|20)\d{2}[a-z]?\.)/gu),
  ].find((match) => match.index !== undefined && match.index > 10)
  const boundaries = [
    visualMarker?.index !== undefined && visualMarker.index > 80 ? visualMarker.index : undefined,
    authorYearMarker?.index !== undefined && authorYearMarker.index > 10
      ? authorYearMarker.index
      : undefined,
  ].filter((index): index is number => index !== undefined)
  const boundary = Math.min(...boundaries, value.length)
  return value.slice(0, boundary)
}

function referenceFromNumberedSegment(marker: string, body: string): ReferenceItem | null {
  const key = marker.trim()
  const entryBody = bibliographyEntryBody(body)
  const rawText = trimReferenceText(`[${key}] ${entryBody}`)
  if (rawText.length < 24) return null
  const yearMatches = [
    ...entryBody.matchAll(/(?:^|[,.]\s+|\s)(19\d{2}|20\d{2})([a-z]?)(?=[.,;\s]|$)/giu),
  ]
  const yearFollowedByPageMarker = yearMatches.find((match) => {
    if (match.index === undefined) return false
    const afterYear = trimReferenceText(entryBody.slice(match.index + match[0].length))
    return /^\d{1,3}\s+[A-Za-z]/u.test(afterYear)
  })
  const yearMatch = yearFollowedByPageMarker ?? yearMatches.at(-1)
  const year = yearMatch?.[1] ? Number.parseInt(yearMatch[1], 10) : null
  const yearEnd = yearMatch?.index === undefined ? -1 : yearMatch.index + yearMatch[0].length
  const textAfterYear = yearEnd >= 0 ? trimReferenceText(entryBody.slice(yearEnd)) : ""
  const yearAtEnd =
    yearEnd >= 0 && (textAfterYear.length < 8 || /^\d{1,3}\s+[A-Za-z]/u.test(textAfterYear))
  const authorTitle = yearAtEnd && yearMatch ? entryBody.slice(0, yearMatch.index) : entryBody
  const boundary = yearAtEnd ? authorBoundary(authorTitle) : -1
  const authors = trimReferenceText(
    yearAtEnd && boundary >= 0
      ? authorTitle.slice(0, boundary)
      : yearMatch && !yearAtEnd
        ? entryBody.slice(0, yearMatch.index)
        : (authorTitle.split(".")[0] ?? ""),
  )
  if (authors.length < 2) return null
  const remainder = trimReferenceText(
    yearAtEnd && boundary >= 0
      ? authorTitle.slice(boundary)
      : yearMatch && !yearAtEnd
        ? entryBody.slice(yearEnd)
        : authorTitle.slice(authors.length),
  )
  const titleEnd = remainder.search(/\.\s+(?=[A-Za-z0-9])/u)
  const title = trimReferenceText(titleEnd >= 8 ? remainder.slice(0, titleEnd) : remainder)
  if (title.length < 8) return null
  const venue = titleEnd >= 8 ? trimReferenceText(remainder.slice(titleEnd + 1)) : ""
  return { key, title, authors, year, venue, rawText }
}

function addNumberedReferences(text: string, map: Record<string, ReferenceItem>): void {
  const hasBracketMarkers = /\[\d{1,3}\]\s+/u.test(text)
  const markers = [...text.matchAll(numberedReferencePattern)].filter(
    (match) => !hasBracketMarkers || match[2] === undefined,
  )
  for (let index = 0; index < markers.length; index += 1) {
    const current = markers[index]
    if (!current || current.index === undefined) continue
    const key = current[1] ?? current[2]
    if (!key) continue
    const bodyStart = current.index + current[0].length
    const next = markers[index + 1]
    const bodyEnd = next?.index ?? text.length
    const entry = referenceFromNumberedSegment(key, text.slice(bodyStart, bodyEnd))
    if (entry) map[key] = entry
  }
}

function authorBoundary(entry: string): number {
  for (const match of entry.matchAll(/\.\s+(?=[A-Z])/gu)) {
    if (match.index === undefined) continue
    const prefix = entry.slice(0, match.index + 1)
    if (/\b\p{Lu}\.$/u.test(prefix)) continue
    const words = prefix.split(/\s+/u)
    if (
      /\bet al\.$/iu.test(prefix) ||
      /\band\s+[^.]+(?:\.\s+[A-Z][^.]+)*\.$/iu.test(prefix) ||
      words.length <= 3
    ) {
      return match.index + 1
    }
  }
  return -1
}

function addYearAtEndReferences(text: string, map: Record<string, ReferenceItem>): void {
  const yearTerminator =
    /(?:,\s*|\.\s*)(20\d{2}[a-z]?)\.(?:\s+Accessed:\s*[^.]+\.)?(?=\s+[A-Z]|\s*$)/gu
  let entryStart = 0
  for (const match of text.matchAll(yearTerminator)) {
    if (match.index === undefined) continue
    const entryEnd = match.index + match[0].length
    const raw = text
      .slice(entryStart, entryEnd)
      .replace(/\s+/gu, " ")
      .replace(/^(?:Preprint\s+)?\d{1,3}\s+/u, "")
      .trim()
    entryStart = entryEnd
    const yearText = match[1]
    if (!yearText || raw.length < 24) continue
    const boundary = authorBoundary(raw)
    if (boundary < 0) continue
    const authors = raw.slice(0, boundary).trim().replace(/[.]$/u, "")
    const remainder = raw.slice(boundary).trim()
    const titleEnd = remainder.search(/\.\s+(?=[A-Za-z])/u)
    const title = (titleEnd >= 8 ? remainder.slice(0, titleEnd) : remainder)
      .replace(/,\s*20\d{2}[a-z]?\.$/u, "")
      .trim()
    const firstAuthor = authors.split(/,|\band\b|\bet al\b/iu)[0]?.trim()
    const surname = firstAuthor
      ?.split(/\s+/u)
      .at(-1)
      ?.replace(/[^\p{L}\p{N}'-]/gu, "")
    if (!surname || title.length < 8) continue
    const key = `${surname.toLowerCase()}-${yearText.toLowerCase()}`
    map[key] = {
      key,
      title,
      authors,
      year: Number.parseInt(yearText, 10),
      venue: remainder
        .slice(title.length)
        .replace(/^[.\s]+|,?\s*20\d{2}[a-z]?\.$/gu, "")
        .trim(),
      rawText: raw,
    }
  }
}

export function extractReferencesFromText(text: string): BibliographyMap {
  const map: Record<string, ReferenceItem> = {}
  const bibliographyText = bibliographySection(text)
  if (!bibliographyText) return map
  const normalizedBibliography = bibliographyText.replace(/\s+/gu, " ").trim()
  addNumberedReferences(normalizedBibliography, map)
  const authorYearPattern =
    /([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'-]+(?:[\s,]+(?:and\s+)?[A-Za-zÀ-ÖØ-öø-ÿ'-]+){1,20})\.\s+(20\d{2}[a-z]?)\.\s+([^.!?]{8,240})\./gu
  for (const match of bibliographyText.matchAll(authorYearPattern)) {
    const authors = match[1]?.trim()
    const yearText = match[2]
    const title = match[3]?.trim()
    if (!authors || !yearText || !title) continue
    const firstAuthor = authors.split(/,|\band\b/iu)[0]?.trim()
    const surname = firstAuthor?.split(/\s+/u).at(-1)
    if (!surname) continue
    const key = `${surname.toLowerCase()}-${yearText.toLowerCase()}`
    if (map[key]) continue
    map[key] = {
      key,
      title,
      authors,
      year: Number.parseInt(yearText, 10),
      venue: "",
      rawText: match[0].trim(),
    }
  }
  addYearAtEndReferences(normalizedBibliography, map)
  return map
}

export function detectPageStructures(
  pageNumber: number,
  lineItems: readonly LineItem[],
  referencesMap: BibliographyMap = {},
): readonly DetectedStructure[] {
  const structures: DetectedStructure[] = []
  let itemIndex = 0

  for (const item of lineItems) {
    const text = item.text.trim()
    if (text.length < 2) continue

    const figMatch = text.match(figurePattern)
    if (figMatch?.[1]) {
      structures.push({
        id: `fig-${pageNumber}-${figMatch[1]}-${itemIndex++}`,
        kind: "figure",
        page: pageNumber,
        title: `Figure ${figMatch[1]} 해설`,
        quote: text,
        bounds: item.bounds,
      })
      continue
    }

    const tabMatch = text.match(tablePattern)
    if (tabMatch?.[1]) {
      structures.push({
        id: `tab-${pageNumber}-${tabMatch[1]}-${itemIndex++}`,
        kind: "table",
        page: pageNumber,
        title: `Table ${tabMatch[1]} 분석`,
        quote: text,
        bounds: item.bounds,
      })
      continue
    }

    const secMatch = text.match(sectionPattern)
    if (secMatch && !text.includes("Table") && !text.includes("Figure")) {
      const headingNumber = secMatch[1] ?? ""
      const headingTitle = secMatch[2] ? secMatch[2].trim() : ""
      const fullTitle = headingTitle ? `${headingNumber} ${headingTitle}` : headingNumber
      if (fullTitle.length >= 3 && fullTitle.length <= 80) {
        structures.push({
          id: `sec-${pageNumber}-${itemIndex++}`,
          kind: "section",
          page: pageNumber,
          title: `${fullTitle} 해설`,
          quote: text,
          bounds: item.bounds,
        })
        continue
      }
    }

    const eqMatch = text.match(equationPattern)
    if (eqMatch && (text.includes("=") || text.includes("(") || text.includes("∑"))) {
      const eqNum = eqMatch[1] ?? eqMatch[2] ?? String(itemIndex + 1)
      structures.push({
        id: `eq-${pageNumber}-${eqNum}-${itemIndex++}`,
        kind: "equation",
        page: pageNumber,
        title: `수식 (${eqNum}) 해설`,
        quote: text,
        bounds: item.bounds,
      })
    }

    for (const citeMatch of text.matchAll(citationPattern)) {
      const rawKeys = citeMatch[1]
      if (!rawKeys) continue
      const keys = rawKeys.split(",").map((k) => k.trim())
      for (const key of keys) {
        const ref = referencesMap[key]
        const structure: DetectedStructure = {
          id: `cite-${pageNumber}-${key}-${itemIndex++}`,
          kind: "citation",
          page: pageNumber,
          title: `참고 문헌 [${key}]`,
          quote: text,
          bounds: item.bounds,
        }
        structures.push(ref ? { ...structure, reference: ref } : structure)
      }
    }
  }
  return structures
}
