import { createHash } from "node:crypto"
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api"
import { z } from "zod"
import type { SourceDocumentAst } from "../shared/documentAst"
import { detectDocumentKind } from "../shared/documentKind"
import { buildDocumentOverview } from "../shared/documentOverview"
import type { DocumentKind } from "../shared/schemas"
import { buildSourceDocumentAst, type SourceAstPageInput } from "./sourceAst"

export type PreparedPage = {
  readonly page: number
  readonly width: number
  readonly height: number
  readonly text: string
}

export type PreparedAnchor = {
  readonly page: number
  readonly quote: string
  readonly start: number
  readonly end: number
}

export type PreparedPdf = {
  readonly hash: string
  readonly pageCount: number
  readonly title: string
  readonly authors: readonly string[]
  readonly year: number | null
  readonly doi: string | null
  readonly kind: DocumentKind
  readonly overview: string
  readonly sourceAst: SourceDocumentAst
  readonly pages: readonly PreparedPage[]
  readonly anchors: readonly PreparedAnchor[]
  readonly quality: {
    readonly textCharacters: number
    readonly needsOcr: boolean
    readonly warnings: readonly string[]
  }
}

export class PdfPreparationError extends Error {
  readonly name = "PdfPreparationError"

  constructor(readonly kind: "invalid_pdf" | "password_required" | "read_failed") {
    super(kind)
  }
}

function isTextItem(value: TextItem | TextMarkedContent): value is TextItem {
  return "str" in value
}

function splitAnchors(page: number, text: string): readonly PreparedAnchor[] {
  const anchors: PreparedAnchor[] = []
  const sentencePattern = /[^.!?\n]+(?:[.!?]+|$)/gu
  for (const match of text.matchAll(sentencePattern)) {
    const quote = match[0].trim()
    const start = match.index
    if (quote.length >= 12 && start !== undefined) {
      anchors.push({ page, quote, start, end: start + match[0].length })
    }
  }
  return anchors
}

const metadataSchema = z.object({
  Title: z.string().optional(),
  Author: z.string().optional(),
  Subject: z.string().optional(),
  PublicationDate: z.string().optional(),
  PublicationYear: z.union([z.string(), z.number()]).optional(),
  Published: z.string().optional(),
  Keywords: z.string().optional(),
})

function errorName(error: unknown): string | null {
  if (error instanceof Error) return error.name
  if (typeof error !== "object" || error === null || !("name" in error)) return null
  return typeof error.name === "string" ? error.name : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error !== "object" || error === null || !("message" in error)) return ""
  return typeof error.message === "string" ? error.message : ""
}

function extractDoi(...values: readonly (string | null)[]): string | null {
  const doiPattern = /10\.\d{4,9}\/[\w.()/:;-]+/iu
  for (const value of values) {
    const match = value?.match(doiPattern)
    if (match?.[0]) return match[0]
  }
  return null
}

function explicitYear(value: string | number | undefined): number | null {
  const candidate = typeof value === "number" ? value : value?.match(/(?:19|20)\d{2}/u)?.[0]
  if (!candidate) return null
  const year = typeof candidate === "number" ? candidate : Number.parseInt(candidate, 10)
  return Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : null
}

function publicationYear(
  info: z.infer<typeof metadataSchema>,
  firstPageText: string,
): number | null {
  const metadataYear =
    explicitYear(info.PublicationYear) ??
    explicitYear(info.PublicationDate) ??
    explicitYear(info.Published)
  if (metadataYear !== null) return metadataYear
  const labeledYear = firstPageText.match(
    /\b(?:published|publication\s+date|published\s+on)\s*:?\s*((?:19|20)\d{2})\b/iu,
  )?.[1]
  const keywordYear = info.Keywords?.match(
    /\bpublication[_\s-]*year\s*:?\s*((?:19|20)\d{2})\b/iu,
  )?.[1]
  return explicitYear(labeledYear ?? keywordYear)
}

function firstPageTitle(sourceAst: SourceDocumentAst): string | null {
  const page = sourceAst.pages[0]
  if (!page) return null
  const items = sourceAst.items.filter((item) => item.pageId === page.id)
  const lines = sourceAst.lines
    .filter((line) => line.pageId === page.id && line.bounds.y < page.height * 0.25)
    .map((line) => {
      const text = line.sourceItemIds
        .map((id) => items.find((item) => item.id === id)?.text ?? "")
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim()
      const heights = line.sourceItemIds.flatMap((id) => {
        const item = sourceAst.rawItems.find((candidate) => candidate.id === id)
        return item ? [item.height] : []
      })
      return { text, bounds: line.bounds, height: Math.max(...heights, line.bounds.height) }
    })
    .filter(
      (line) =>
        line.text.length >= 12 &&
        line.text.length <= 180 &&
        !/^(?:abstract|introduction|keywords?|doi|arxiv|figure|fig\.?|table)\b/iu.test(line.text) &&
        !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(line.text),
    )
    .sort((left, right) => right.height - left.height || left.bounds.y - right.bounds.y)
  const candidate = lines[0]
  if (!candidate) return null
  const titleLines = lines
    .filter(
      (line) =>
        Math.abs(line.height - candidate.height) <= candidate.height * 0.05 &&
        Math.abs(line.bounds.y - candidate.bounds.y) <= candidate.height * 1.8,
    )
    .sort((left, right) => left.bounds.y - right.bounds.y)
  const competitor = lines.find((line) => !titleLines.includes(line))
  if (competitor && candidate.height < competitor.height * 1.15) return null
  const title = titleLines
    .map((line) => line.text)
    .join(" ")
    .replace(/\s+arXiv:\S+(?:\s+\[[^\]]+\])?.*$/iu, "")
    .trim()
  return title.length <= 240 ? title : null
}

function splitAuthorNames(line: string): readonly string[] {
  const tokens = line
    .replace(/[∗*†‡]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
  if (
    tokens.length < 2 ||
    tokens.length > 20 ||
    tokens.some((token) => !/^(?:\p{Lu}[\p{L}'’-]*|\p{Lu}\.)$/u.test(token))
  )
    return []
  const names: string[] = []
  for (let index = 0; index < tokens.length; ) {
    const given = tokens[index]
    if (!given) return []
    const parts = [given]
    index += 1
    while (tokens[index] && /^\p{Lu}\.$/u.test(tokens[index] ?? "")) {
      parts.push(tokens[index] ?? "")
      index += 1
    }
    const family = tokens[index]
    if (!family) return []
    parts.push(family)
    index += 1
    names.push(parts.join(" "))
  }
  return names
}

function firstPageAuthors(sourceAst: SourceDocumentAst, title: string): readonly string[] {
  const page = sourceAst.pages[0]
  if (!page) return []
  const items = sourceAst.items.filter((item) => item.pageId === page.id)
  const lines = sourceAst.lines
    .filter((line) => line.pageId === page.id && line.bounds.y < page.height * 0.55)
    .map((line) => ({
      text: line.sourceItemIds
        .map((id) => items.find((item) => item.id === id)?.text ?? "")
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim(),
      bounds: line.bounds,
    }))
    .sort((left, right) => left.bounds.y - right.bounds.y)
  const titleBottom = lines
    .filter((line) => title.includes(line.text) || line.text.includes(title))
    .reduce(
      (bottom, line) =>
        Math.max(bottom, line.bounds.y + Math.min(line.bounds.height, page.height * 0.05)),
      0,
    )
  if (titleBottom === 0) return []
  const abstractTop = lines.find(
    (line) => line.bounds.y > titleBottom && /^abstract\b/iu.test(line.text),
  )?.bounds.y
  return lines
    .filter(
      (line) =>
        line.bounds.y > titleBottom &&
        line.bounds.y < (abstractTop ?? page.height * 0.55) &&
        !/@|\b(?:university|institute|department|research|laboratory|language|google)\b/iu.test(
          line.text,
        ),
    )
    .flatMap((line) => splitAuthorNames(line.text))
}

export async function preparePdf(bytes: Uint8Array, fileName: string): Promise<PreparedPdf> {
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new PdfPreparationError("invalid_pdf")
  }

  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
    const document = await task.promise
    const metadata = await document.getMetadata()
    const infoResult = metadataSchema.safeParse(metadata.info)
    const info = infoResult.success ? infoResult.data : {}
    const pages: PreparedPage[] = []
    const sourceAstPages: SourceAstPageInput[] = []
    const anchors: PreparedAnchor[] = []

    for (let index = 0; index < document.numPages; index += 1) {
      const page = await document.getPage(index + 1)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const text = content.items
        .filter(isTextItem)
        .map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`)
        .join("")
        .replace(/\s+\n/gu, "\n")
        .trim()
      pages.push({ page: index + 1, width: viewport.width, height: viewport.height, text })
      sourceAstPages.push({
        page: index + 1,
        width: viewport.width,
        height: viewport.height,
        items: content.items,
      })
      anchors.push(...splitAnchors(index + 1, text))
    }

    const author = info.Author?.trim() || null
    const subject = info.Subject?.trim() || null
    const textCharacters = pages.reduce((total, page) => total + page.text.length, 0)
    const hash = createHash("sha256").update(bytes).digest("hex")
    const sourceAst = buildSourceDocumentAst(hash, sourceAstPages)
    const title =
      info.Title?.trim() || firstPageTitle(sourceAst) || fileName.replace(/\.pdf$/iu, "")
    const authors = author
      ? author.split(/[;,]/u).map((value) => value.trim())
      : firstPageAuthors(sourceAst, title)
    const year = publicationYear(info, pages[0]?.text ?? "")
    const warnings = pages
      .filter((page) => page.text.length < 24)
      .map((page) => `${page.page}페이지의 텍스트 품질을 확인하세요.`)

    await task.destroy()
    return {
      hash,
      pageCount: pages.length,
      title,
      authors,
      year,
      doi: extractDoi(subject, pages.map((page) => page.text).join("\n")),
      kind: detectDocumentKind(pages.map((page) => page.text).join("\n"), pages.length),
      overview: buildDocumentOverview(pages),
      sourceAst,
      pages,
      anchors,
      quality: { textCharacters, needsOcr: textCharacters < pages.length * 24, warnings },
    }
  } catch (error) {
    if (error instanceof PdfPreparationError) throw error
    const name = errorName(error)
    const message = errorMessage(error)
    if (name === "PasswordException" || /password|no password given/iu.test(message)) {
      throw new PdfPreparationError("password_required")
    }
    if (name === "InvalidPDFException" || /invalid pdf structure/iu.test(message)) {
      throw new PdfPreparationError("invalid_pdf")
    }
    throw new PdfPreparationError("read_failed")
  }
}
