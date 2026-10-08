import type { Element, ElementContent, Root } from "hast"

/** "[1]", "[2,3]", "[4,5–7]": the markers the page parser writes for citation superscripts. */
const CITATION_MARKER = /\[(\d{1,3}(?:[,，–—-]\d{1,3})*)\]/gu
/** Text inside these is code, math or a link, never a citation marker. */
const SKIPPED_TAGS = new Set(["a", "button", "code", "pre", "sup"])

function isMath(element: Element): boolean {
  const className: unknown = Reflect.get(element.properties, "className")
  return (
    Array.isArray(className) &&
    className.some((name) => typeof name === "string" && name.startsWith("katex"))
  )
}

function markerChildren(value: string): ElementContent[] | null {
  const children: ElementContent[] = []
  let consumed = 0
  for (const match of value.matchAll(CITATION_MARKER)) {
    const [text, numbers = ""] = match
    if (match.index > consumed)
      children.push({ type: "text", value: value.slice(consumed, match.index) })
    children.push({
      type: "element",
      tagName: "sup",
      properties: { className: ["citation-marker"] },
      children: [{ type: "text", value: numbers }],
    })
    consumed = match.index + text.length
  }
  if (consumed === 0) return null
  if (consumed < value.length) children.push({ type: "text", value: value.slice(consumed) })
  return children
}

function markElement(element: Element): void {
  if (SKIPPED_TAGS.has(element.tagName) || isMath(element)) return
  element.children = element.children.flatMap((child): ElementContent[] => {
    if (child.type === "text") return markerChildren(child.value) ?? [child]
    if (child.type === "element") markElement(child)
    return [child]
  })
}

/**
 * Rehype plugin that sets bracketed citation markers as superscripts, so "difficult[1]."
 * reads as the raised reference number it was on the page rather than as a count.
 */
export function rehypeCitationMarkers(): (tree: Root) => void {
  return (tree) => {
    for (const child of tree.children) if (child.type === "element") markElement(child)
  }
}
