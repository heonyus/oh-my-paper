import type { Locale } from "../../shared/i18n/locale"
import { libraryMessages } from "../messages/library"
import type { DocumentRecord } from "../types"

export function documentAuthors(document: DocumentRecord, locale: Locale): string {
  return document.authors.slice(0, 3).join(", ") || libraryMessages[locale]["doc.unknownAuthors"]
}

export function documentSearchText(document: DocumentRecord): string {
  return [document.title, document.name, document.authors.join(" "), document.doi ?? ""]
    .join(" ")
    .toLocaleLowerCase()
}

const dateLocales: Readonly<Record<Locale, string>> = { ko: "ko-KR", en: "en-US" }

/** Built once per language: constructing a formatter per row dominated rendering a large library. */
const importedAtFormats = new Map<Locale, Intl.DateTimeFormat>()

export function formatImportedAt(value: string, locale: Locale): string {
  let format = importedAtFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(dateLocales[locale], { dateStyle: "medium" })
    importedAtFormats.set(locale, format)
  }
  return format.format(new Date(value))
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function normalizedReadingPage(document: DocumentRecord): number | null {
  const page = document.lastReadPage
  return typeof page === "number" && page > 0 && page <= document.pageCount ? page : null
}
