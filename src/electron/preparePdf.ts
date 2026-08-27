import { createHash } from "node:crypto"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api"
import { z } from "zod"

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
  CreationDate: z.string().optional(),
})

function extractDoi(...values: readonly (string | null)[]): string | null {
  const doiPattern = /10\.\d{4,9}\/[\w.()/:;-]+/iu
  for (const value of values) {
    const match = value?.match(doiPattern)
    if (match?.[0]) return match[0]
  }
  return null
}

export async function preparePdf(bytes: Uint8Array, fileName: string): Promise<PreparedPdf> {
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new PdfPreparationError("invalid_pdf")
  }

  try {
    const task = getDocument({ data: bytes.slice(), useSystemFonts: true })
    const document = await task.promise
    const metadata = await document.getMetadata()
    const infoResult = metadataSchema.safeParse(metadata.info)
    const info = infoResult.success ? infoResult.data : {}
    const pages: PreparedPage[] = []
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
      anchors.push(...splitAnchors(index + 1, text))
    }

    const title = info.Title?.trim() || fileName.replace(/\.pdf$/iu, "")
    const author = info.Author?.trim() || null
    const subject = info.Subject?.trim() || null
    const creationDate = info.CreationDate?.trim() || null
    const yearMatch = creationDate?.match(/(?:19|20)\d{2}/u)
    const textCharacters = pages.reduce((total, page) => total + page.text.length, 0)
    const warnings = pages
      .filter((page) => page.text.length < 24)
      .map((page) => `${page.page}페이지의 텍스트 품질을 확인하세요.`)

    await task.destroy()
    return {
      hash: createHash("sha256").update(bytes).digest("hex"),
      pageCount: pages.length,
      title,
      authors: author ? author.split(/[;,]/u).map((value) => value.trim()) : [],
      year: yearMatch ? Number(yearMatch[0]) : null,
      doi: extractDoi(subject, pages.map((page) => page.text).join("\n")),
      pages,
      anchors,
      quality: { textCharacters, needsOcr: textCharacters < pages.length * 24, warnings },
    }
  } catch (error) {
    if (error instanceof PdfPreparationError) throw error
    if (error instanceof Error && error.name === "PasswordException") {
      throw new PdfPreparationError("password_required")
    }
    if (error instanceof Error && error.name === "InvalidPDFException") {
      throw new PdfPreparationError("invalid_pdf")
    }
    throw new PdfPreparationError("read_failed")
  }
}
