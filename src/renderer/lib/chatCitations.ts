import type { Element, ElementContent, Root } from "hast"

export type SourceCitation = { readonly page: number; readonly quote?: string | undefined }

const CITATION_HREF = /^#page-(\d{1,4})(?:\?q=(.*))?$/u
/**
 * `[[p.12 | verbatim phrase]]`, the inline format the chat prompt asks for, or a plain page
 * mention from older answers: "Page 2", "p. 11~14", "11페이지".
 */
const SOURCE_REFERENCE =
  /\[\[\s*p\.?\s*(\d{1,4})\s*(?:\|\s*([^\]\n]{1,300}?))?\s*\]\]|(?<![\p{L}\p{N}[#/.(=])(?:(?:Page|page|pp?\.)\s?(\d{1,4})(?:\s?[-–~]\s?\d{1,4})?|(\d{1,4})(?:\s?[-–~]\s?\d{1,4})?\s?페이지)(?![\p{N}\]])/gu
/** Text inside these is code, math or already a link, never a citation. */
const SKIPPED_TAGS = new Set(["a", "button", "code", "pre"])

function citationHref(page: number, quote?: string): string {
  return quote ? `#page-${page}?q=${encodeURIComponent(quote)}` : `#page-${page}`
}

function citationChildren(value: string): ElementContent[] | null {
  const children: ElementContent[] = []
  let consumed = 0
  for (const match of value.matchAll(SOURCE_REFERENCE)) {
    const [text, markerPage, markerQuote, englishPage, koreanPage] = match
    const page = Number(markerPage ?? englishPage ?? koreanPage)
    if (!Number.isInteger(page) || page < 1) continue
    if (match.index > consumed)
      children.push({ type: "text", value: value.slice(consumed, match.index) })
    children.push({
      type: "element",
      tagName: "a",
      properties: { href: citationHref(page, markerQuote?.trim() || undefined) },
      children: [{ type: "text", value: markerPage ? `p.${page}` : text }],
    })
    consumed = match.index + text.length
  }
  if (consumed === 0) return null
  if (consumed < value.length) children.push({ type: "text", value: value.slice(consumed) })
  return children
}

function isMath(element: Element): boolean {
  const className: unknown = Reflect.get(element.properties, "className")
  return (
    Array.isArray(className) &&
    className.some((name) => typeof name === "string" && name.startsWith("katex"))
  )
}

function linkElement(element: Element): void {
  if (SKIPPED_TAGS.has(element.tagName) || isMath(element)) return
  element.children = element.children.flatMap((child): ElementContent[] => {
    if (child.type === "text") return citationChildren(child.value) ?? [child]
    if (child.type === "element") linkElement(child)
    return [child]
  })
}

/**
 * Rehype plugin that turns page citations into `#page-N` links after Markdown parsing,
 * so a citation inside `**…**` next to Korean text cannot break the emphasis.
 */
export function rehypeSourceCitations(): (tree: Root) => void {
  return (tree) => {
    for (const child of tree.children) if (child.type === "element") linkElement(child)
  }
}

export function parseCitationHref(href: string): SourceCitation | null {
  const match = CITATION_HREF.exec(href)
  if (!match?.[1]) return null
  const page = Number(match[1])
  if (!Number.isInteger(page) || page < 1) return null
  try {
    const quote = match[2] ? decodeURIComponent(match[2]) : undefined
    return quote ? { page, quote } : { page }
  } catch (error) {
    if (error instanceof URIError) return { page }
    throw error
  }
}
