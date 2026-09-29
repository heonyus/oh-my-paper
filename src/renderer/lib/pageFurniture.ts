/** Running headers and footers repeat on most pages; a page number is the only part that varies. */
const minimumRepeatedPages = 3
const maximumFurnitureTokens = 16

function normalizedToken(token: string): string {
  return token.replace(/\d+/gu, "#")
}

function repeatedEdge(
  pages: readonly (readonly string[])[],
  edge: "start" | "end",
): readonly string[] | null {
  const threshold = Math.max(minimumRepeatedPages, Math.ceil(pages.length * 0.3))
  let best: { readonly tokens: readonly string[]; readonly count: number } | null = null
  for (let length = maximumFurnitureTokens; length >= 2; length -= 1) {
    const counts = new Map<string, number>()
    for (const tokens of pages) {
      if (tokens.length <= length) continue
      const slice = edge === "start" ? tokens.slice(0, length) : tokens.slice(-length)
      const key = slice.map(normalizedToken).join(" ")
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const [key, count] of counts) {
      // The run shared by the most pages is the furniture; a longer run shared by fewer pages
      // is furniture plus the start of those pages' content.
      if (count >= threshold && count > (best?.count ?? 0)) best = { tokens: key.split(" "), count }
    }
  }
  return best?.tokens ?? null
}

/** Two-column layouts can repeat a header twice on one page, so every leading copy goes. */
function stripEdge(
  tokens: readonly string[],
  furniture: readonly string[],
  edge: "start" | "end",
): readonly string[] {
  let remaining = tokens
  while (remaining.length > furniture.length) {
    const slice =
      edge === "start" ? remaining.slice(0, furniture.length) : remaining.slice(-furniture.length)
    if (slice.map(normalizedToken).join(" ") !== furniture.join(" ")) break
    remaining =
      edge === "start" ? remaining.slice(furniture.length) : remaining.slice(0, -furniture.length)
  }
  return remaining
}

/**
 * Removes running headers and footers that repeat across pages, so a reference list that spans a
 * page break does not swallow "Journal | VOL 26 | 364–373 | www.journal.com 372" into an entry.
 */
export function withoutPageFurniture(pageTexts: readonly string[]): readonly string[] {
  if (pageTexts.length < minimumRepeatedPages) return pageTexts
  let pages: readonly (readonly string[])[] = pageTexts.map((text) =>
    text.split(/\s+/u).filter((token) => token.length > 0),
  )
  for (let round = 0; round < 3; round += 1) {
    const header = repeatedEdge(pages, "start")
    const footer = repeatedEdge(pages, "end")
    if (!header && !footer) break
    pages = pages.map((tokens) => {
      const withoutHeader = header ? stripEdge(tokens, header, "start") : tokens
      return footer ? stripEdge(withoutHeader, footer, "end") : withoutHeader
    })
  }
  return pages.map((tokens) => tokens.join(" "))
}
