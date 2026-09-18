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
  CreationDate: z.string().optional(),
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

    const title = info.Title?.trim() || fileName.replace(/\.pdf$/iu, "")
    const author = info.Author?.trim() || null
    const subject = info.Subject?.trim() || null
    const creationDate = info.CreationDate?.trim() || null
    const yearMatch = creationDate?.match(/(?:19|20)\d{2}/u)
    const textCharacters = pages.reduce((total, page) => total + page.text.length, 0)
    const hash = createHash("sha256").update(bytes).digest("hex")
    const sourceAst = buildSourceDocumentAst(hash, sourceAstPages)
    const warnings = pages
      .filter((page) => page.text.length < 24)
      .map((page) => `${page.page}페이지의 텍스트 품질을 확인하세요.`)

    await task.destroy()
    return {
      hash,
      pageCount: pages.length,
      title,
      authors: author ? author.split(/[;,]/u).map((value) => value.trim()) : [],
      year: yearMatch ? Number(yearMatch[0]) : null,
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
