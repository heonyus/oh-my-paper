import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

function declarations(stylesheet: string, selector: string): readonly string[] {
  for (const block of stylesheet.split("}")) {
    const [header, body] = block.split("{")
    if (header?.trim() === selector && body !== undefined)
      return body
        .split(";")
        .map((declaration) => declaration.trim())
        .filter(Boolean)
  }
  return []
}

describe("reader workspace overflow", () => {
  it("clips the off-screen research flyout without becoming a scroll container", async () => {
    // Given
    const stylesheet = await readFile("src/renderer/components/reader-workspace.css", "utf8")

    // When
    const workspace = declarations(stylesheet, ".reader-workspace")

    // Then
    expect(workspace).toContain("overflow-x: clip")
  })

  it("reads declarations only from the exact selector", () => {
    // Given
    const stylesheet = ".reader-workspace > * {\n  overflow-x: clip;\n}\n.reader-workspace {\n}"

    // When
    const workspace = declarations(stylesheet, ".reader-workspace")

    // Then
    expect(workspace).toEqual([])
  })
})
