import { describe, expect, it } from "vitest"
import {
  addColumnToTable,
  addRowToTable,
  findTableAt,
  isRenderableMath,
  safeNoteImageSource,
} from "../../../src/renderer/components/notes/noteRichContent"

describe("note rich content", () => {
  it("preserves escaped pipes and explicit line breaks when editing a GFM table", () => {
    // Given
    const source = "| a\\|b | c<br>d |\n| :--- | ---: |\n| one | two |"
    const table = findTableAt(source, source.indexOf("one"))

    // When
    const withRow = addRowToTable(source, table)
    const withColumn = addColumnToTable(withRow.source, findTableAt(withRow.source, 1))

    // Then
    expect(withColumn.source).toBe(
      "| a\\|b | c<br>d |  |\n| :--- | ---: | --- |\n| one | two |  |\n|  |  |  |",
    )
  })

  it("maps canonical collection assets without allowing authority bypasses", () => {
    // Given / When / Then
    const hash = "a".repeat(64)
    expect(safeNoteImageSource(`assets/${hash}.png`)).toBe(
      `scourgify-asset://local/assets/${hash}.png`,
    )
    expect(safeNoteImageSource(`../assets/${hash}.png`)).toBe(
      `scourgify-asset://local/assets/${hash}.png`,
    )
    expect(safeNoteImageSource(`../../assets/${hash}.png`)).toBe(
      `scourgify-asset://local/assets/${hash}.png`,
    )
    expect(safeNoteImageSource(`assets/${hash}.jpg`)).toBe(
      `scourgify-asset://local/assets/${hash}.jpg`,
    )
    expect(safeNoteImageSource("https://example.com/tracker.png")).toBeNull()
    expect(safeNoteImageSource("//example.com/tracker.png")).toBeNull()
    expect(safeNoteImageSource("file:///tmp/ohmypaper/image.png")).toBeNull()
    expect(safeNoteImageSource("app://assets/private.png")).toBeNull()
    expect(safeNoteImageSource(`assets/../${hash}.png`)).toBeNull()
    expect(safeNoteImageSource(`../assets/../${hash}.png`)).toBeNull()
    expect(safeNoteImageSource(`other/${hash}.png`)).toBeNull()
    expect(safeNoteImageSource(`./assets/${hash}.png`)).toBeNull()
    expect(safeNoteImageSource(`assets/${hash}.gif`)).toBeNull()
  })

  it("leaves invalid math as source instead of rendering an error replacement", () => {
    // Given / When / Then
    expect(isRenderableMath(String.raw`\frac{1}{2}`)).toBe(true)
    expect(isRenderableMath(String.raw`\frac{`)).toBe(false)
  })
})
