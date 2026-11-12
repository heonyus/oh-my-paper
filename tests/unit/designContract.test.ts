import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const section = "## 9. Document Preparation and Enrichment"
const required = [
  "SourceDocumentAst",
  "SemanticDocumentAst",
  "RenderedDocumentGeometry",
  "AI 구조 보강",
  "budget-paused",
  "movable board cards",
]

function hasContract(markdown: string): boolean {
  const start = markdown.indexOf(section)
  if (start < 0) return false
  const content = markdown.slice(start)
  return required.every((phrase) => content.includes(phrase))
}

describe("document preparation design contract", () => {
  it("contains every required preparation and enrichment state", async () => {
    // Given
    const markdown = await readFile("DESIGN.md", "utf8")

    // When
    const result = hasContract(markdown)

    // Then
    expect(result).toBe(true)
  })

  it("rejects a contract without budget-paused", () => {
    // Given
    const markdown = `${section}\n${required.filter((phrase) => phrase !== "budget-paused").join("\n")}`

    // When
    const result = hasContract(markdown)

    // Then
    expect(result).toBe(false)
  })

  it("keeps page parsing visibly active with a reduced-motion fallback", async () => {
    const stylesheet = await readFile("src/renderer/components/page-translation.css", "utf8")

    expect(stylesheet).toContain("animation: page-translation-progress")
    expect(stylesheet).toContain("@keyframes page-translation-progress")
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)")
  })

  it("stops holding card text at screen size once the board is zoomed out past a floor", async () => {
    const stylesheet = await readFile("src/renderer/components/board-card.css", "utf8")
    const card = stylesheet.slice(
      stylesheet.indexOf(".board-card {"),
      stylesheet.indexOf("position: absolute"),
    )

    expect(stylesheet).toContain(
      "--board-text-zoom: max(var(--board-zoom, 1), var(--board-text-floor));",
    )
    // Every text size a card sets is divided by the floored zoom, never by the board's own.
    expect(card.match(/\/ var\(--board-text-zoom, 1\)/gu)).toHaveLength(4)
    expect(card).not.toContain("var(--board-zoom")
  })
})
