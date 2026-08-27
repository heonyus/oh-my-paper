import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { resolveRendererIndex } from "../../src/electron/paths"

describe("packaged renderer path", () => {
  it("resolves from the emitted electron directory to the bundled renderer", () => {
    // Given
    const emittedDirectory = join("/app", "dist-electron", "electron")

    // When
    const result = resolveRendererIndex(emittedDirectory)

    // Then
    expect(result).toBe(join("/app", "dist", "index.html"))
  })
})
