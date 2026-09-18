import { describe, expect, it, vi } from "vitest"
import { insertNoteAsset } from "../../../src/renderer/lib/insertNoteAsset"

describe("renderer note asset insertion", () => {
  it("adds the canonical note id while retaining the old no-context request", async () => {
    // Given
    const importAsset = vi.fn(async () => null)
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: { collection: { importAsset } },
    })

    // When
    await insertNoteAsset({ kind: "pick" }, "11111111-1111-4111-8111-111111111111")
    await insertNoteAsset({ kind: "pick" })

    // Then
    expect(importAsset).toHaveBeenNthCalledWith(1, {
      kind: "pick",
      noteId: "11111111-1111-4111-8111-111111111111",
    })
    expect(importAsset).toHaveBeenNthCalledWith(2, { kind: "pick" })
  })
})
