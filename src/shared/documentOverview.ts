export type OverviewPage = {
  readonly page: number
  readonly text: string
}

export function buildDocumentOverview(pages: readonly OverviewPage[]): string {
  return [...pages]
    .map((page) => {
      const text = page.text.replace(/\s+/gu, " ").trim()
      const score =
        (page.page === 1 ? 10 : 0) +
        (/\b(?:abstract|executive summary|overview)\b/iu.test(text) ? 6 : 0) +
        (/\b(?:method|approach|framework|procedure)\b/iu.test(text) ? 4 : 0) +
        (/\b(?:result|finding|evaluation|recommendation)\b/iu.test(text) ? 4 : 0) +
        (/\b(?:conclusion|discussion|limitation)\b/iu.test(text) ? 3 : 0)
      return { page: page.page, text, score }
    })
    .filter((page) => page.text)
    .sort((left, right) => right.score - left.score || left.page - right.page)
    .slice(0, 6)
    .map((page) => `Page ${page.page}: ${page.text}`)
    .join("\n\n")
    .slice(0, 8_000)
}
