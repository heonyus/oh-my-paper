// @vitest-environment node
import { describe, expect, it } from "vitest"
import { resolveExportAssetPath } from "../../../src/electron/exportAssetPath"

const asset = `assets/${"a".repeat(64)}.png`

describe("export asset paths", () => {
  it("resolves canonical note-relative assets at every note depth and keeps legacy paths", () => {
    // Given
    const topLevel = "notes/note.md"
    const nested = "notes/research/note.md"

    // When
    const resolvedTopLevel = resolveExportAssetPath(`../assets/${asset.slice(7)}`, topLevel)
    const resolvedNested = resolveExportAssetPath(`../../assets/${asset.slice(7)}`, nested)
    const resolvedLegacy = resolveExportAssetPath(asset, nested)

    // Then
    expect(resolvedTopLevel).toBe(asset)
    expect(resolvedNested).toBe(asset)
    expect(resolvedLegacy).toBe(asset)
  })

  it("rejects a note-relative path that escapes the collection assets root", () => {
    expect(resolveExportAssetPath(`../../assets/${asset.slice(7)}`, "notes/note.md")).toBeNull()
  })
})
