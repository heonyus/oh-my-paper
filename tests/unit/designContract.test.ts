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
})
