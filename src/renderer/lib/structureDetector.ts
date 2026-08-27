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

export function extractReferencesFromText(text: string): BibliographyMap {
  const map: Record<string, ReferenceItem> = {}
  const refSectionIndex = text.search(/\b(?:References|Bibliography)\b/iu)
  const bibliographyText = refSectionIndex >= 0 ? text.slice(refSectionIndex) : text
  const entryPattern =
    /(?:\[(\d+)\]|(\d+)\.)\s+([^.\n]{3,180})\.\s+(?:(20\d{2}[a-z]?)\.\s+)?([^.\n]{8,240})\.(?:\s+([^.\n]{2,180})\.)?/gu

  for (const match of bibliographyText.matchAll(entryPattern)) {
    const key = match[1] ?? match[2]
    if (!key) continue
    const authors = (match[3] ?? "Unknown Authors").trim().replace(/[,.]$/u, "")
    const yearStr = match[4]
    const year = yearStr ? Number(yearStr) : null
    const title = (match[5] ?? "Academic Publication").trim().replace(/^["']|["']$/gu, "")
    const venue = (match[6] ?? "").trim()
    map[key] = {
      key,
      title,
      authors,
      year,
      venue,
      rawText: match[0].trim(),
    }
  }
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
        structures.push({
          id: `cite-${pageNumber}-${key}-${itemIndex++}`,
          kind: "citation",
          page: pageNumber,
          title: `참고 문헌 [${key}]`,
          quote: text,
          bounds: item.bounds,
          reference: ref ?? {
            key,
            title: `Citation Reference [${key}]`,
            authors: "Cited Paper Authors",
            year: null,
            venue: "Academic Journal / Conference",
            rawText: `[${key}] Referenced paper in bibliography`,
          },
        })
      }
    }
  }
  return structures
}
