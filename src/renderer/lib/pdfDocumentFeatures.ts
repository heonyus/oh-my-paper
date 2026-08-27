import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import { z } from "zod"
import { buildCitationIndex, type CitationIndexEntry } from "./pdfCitationIndex"
import type { PdfFeature, PdfTextSpan } from "./pdfFeatureDetection"
import {
  type BibliographyMap,
  type DetectedStructure,
  extractReferencesFromText,
  type ReferenceItem,
} from "./structureDetector"

export type PreparedSummary = {
  readonly pages: number
  readonly title: string
  readonly textCharacters: number
  readonly anchorCount: number
  readonly needsOcr: boolean
  readonly citations?: readonly CitationIndexEntry[]
}

function stableFeatureId(feature: PdfFeature): string {
  const source = `${feature.kind}|${feature.pageNumber}|${feature.label}|${feature.context}`
  let hash = 2166136261
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return `${feature.kind}-${feature.pageNumber}-${(hash >>> 0).toString(36)}`
}

const metadataTitleSchema = z.object({ Title: z.string().optional() })

function citationReference(
  feature: PdfFeature,
  bibliography: BibliographyMap,
): ReferenceItem | undefined {
  const numericKey = feature.context.match(/\[(\d+)/u)?.[1]
  if (numericKey && bibliography[numericKey]) return bibliography[numericKey]
  const authorYear = feature.context.match(/([A-Z][A-Za-z-]+)(?:\s+et al\.)?,?\s+(\d{4})/u)
  if (!authorYear?.[1]) return undefined
  const authorYearKey = `${authorYear[1].toLowerCase()}-${(authorYear[2] ?? "").toLowerCase()}`
  if (bibliography[authorYearKey]) return bibliography[authorYearKey]
  return {
    key: authorYearKey,
    title: "인용 논문 제목을 확인하는 중",
    authors: authorYear[1],
    year: authorYear[2] ? Number(authorYear[2]) : null,
    venue: "",
    rawText: feature.context,
  }
}

function featureContext(feature: PdfFeature, spans: readonly PdfTextSpan[]): string {
  if (feature.kind !== "heading" && feature.kind !== "subheading") return feature.context
  const center = feature.rect.x + feature.rect.width / 2
  const nearby = spans.filter((span) => {
    const spanCenter = span.x + span.width / 2
    return (
      span.y > feature.rect.y &&
      span.y < feature.rect.y + 280 &&
      Math.abs(spanCenter - center) < Math.max(feature.rect.width * 1.5, 180)
    )
  })
  return [feature.label, ...nearby.slice(0, 16).map((span) => span.text)].join(" ").slice(0, 4_000)
}

export function featureToStructure(
  feature: PdfFeature,
  spans: readonly PdfTextSpan[],
  bibliography: BibliographyMap,
): DetectedStructure {
  const kind: DetectedStructure["kind"] =
    feature.kind === "heading" || feature.kind === "subheading" ? "section" : feature.kind
  const reference =
    feature.kind === "citation" ? citationReference(feature, bibliography) : undefined
  const base: Omit<DetectedStructure, "reference"> = {
    id: stableFeatureId(feature),
    kind,
    page: feature.pageNumber,
    title: `${feature.label} ${kind === "citation" ? "" : "해설"}`.trim(),
    quote: featureContext(feature, spans),
    bounds: feature.rect,
  }
  return reference ? { ...base, reference } : base
}

export async function analyzePdfDocument(
  pdf: PDFDocumentProxy,
  fallbackTitle: string,
): Promise<{ readonly summary: PreparedSummary; readonly bibliography: BibliographyMap }> {
  const metadata = await pdf.getMetadata()
  const metadataResult = metadataTitleSchema.safeParse(metadata.info)
  const title = metadataResult.success
    ? (metadataResult.data.Title ?? fallbackTitle)
    : fallbackTitle
  const pageTexts = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1)
      const content = await page.getTextContent()
      return content.items
        .filter((item) => "str" in item)
        .map((item) => item.str)
        .join(" ")
    }),
  )
  const fullText = pageTexts.join("\n")
  const bibliography = extractReferencesFromText(fullText)
  const textCharacters = pageTexts.reduce((total, text) => total + text.length, 0)
  const anchorCount = pageTexts.reduce(
    (total, text) => total + (text.match(/[^.!?]+(?:[.!?]+|$)/gu)?.length ?? 0),
    0,
  )
  return {
    summary: {
      pages: pdf.numPages,
      title,
      textCharacters,
      anchorCount,
      needsOcr: textCharacters < pdf.numPages * 24,
      citations: buildCitationIndex(bibliography, pageTexts),
    },
    bibliography,
  }
}
