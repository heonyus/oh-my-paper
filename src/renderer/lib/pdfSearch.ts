export function findPdfTextPage(query: string): number | null {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return null
  for (const span of document.querySelectorAll<HTMLElement>(".textLayer span")) {
    if (!span.textContent?.toLocaleLowerCase().includes(needle)) continue
    const page = Number(span.closest<HTMLElement>(".page")?.getAttribute("data-page-number"))
    if (Number.isInteger(page) && page > 0) return page
  }
  return null
}

export function paperContextForQuestion(question: string, currentPage: number): string {
  const terms = question
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((term) => term.length >= 2)
  const pages = Array.from(document.querySelectorAll<HTMLElement>(".page")).flatMap((page) => {
    const pageNumber = Number(page.getAttribute("data-page-number"))
    const text = page
      .querySelector<HTMLElement>(".textLayer")
      ?.textContent?.replace(/\s+/gu, " ")
      .trim()
    if (!Number.isInteger(pageNumber) || !text) return []
    const normalized = text.toLocaleLowerCase()
    const score =
      terms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0) +
      (pageNumber === currentPage ? 1 : 0)
    return [{ pageNumber, text, score }]
  })
  return pages
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 4)
    .map((page) => `Page ${page.pageNumber}: ${page.text}`)
    .join("\n\n")
    .slice(0, AI_CONTEXT_MAX_CHARACTERS)
}

export function paperOverviewContext(): string {
  const pages = Array.from(document.querySelectorAll<HTMLElement>(".page")).flatMap((page) => {
    const pageNumber = Number(page.getAttribute("data-page-number"))
    const text = page
      .querySelector<HTMLElement>(".textLayer")
      ?.textContent?.replace(/\s+/gu, " ")
      .trim()
    if (!Number.isInteger(pageNumber) || !text) return []
    const score =
      (pageNumber === 1 ? 8 : 0) +
      (/\b(?:method|approach|framework)\b/iu.test(text) ? 4 : 0) +
      (/\b(?:experiment|result|evaluation)\b/iu.test(text) ? 3 : 0) +
      (/\b(?:conclusion|limitation|discussion)\b/iu.test(text) ? 3 : 0)
    return [{ pageNumber, text, score }]
  })
  return pages
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 6)
    .map((page) => `Page ${page.pageNumber}: ${page.text}`)
    .join("\n\n")
    .slice(0, AI_CONTEXT_MAX_CHARACTERS)
}

import { AI_CONTEXT_MAX_CHARACTERS } from "../../shared/ipc"

const paperOverviewCache = new Map<string, string>()

export function cachedPaperOverviewContext(documentId: string): string {
  const cached = paperOverviewCache.get(documentId)
  if (cached) return cached
  const context = paperOverviewContext()
  if (context) paperOverviewCache.set(documentId, context)
  return context
}
