import { describe, expect, it } from "vitest"
import { selectionActionForShortcut } from "../../src/renderer/lib/selectionActions"

describe("selection shortcuts", () => {
  it("maps selection keys to local actions", () => {
    expect(selectionActionForShortcut("E")).toBe("explanation")
    expect(selectionActionForShortcut("t")).toBe("translation")
    expect(selectionActionForShortcut("I")).toBe("infographic")
    expect(selectionActionForShortcut("h")).toBe("highlight")
    expect(selectionActionForShortcut("C")).toBe("note")
  })

  it("ignores keys without a selection action", () => {
    expect(selectionActionForShortcut("Enter")).toBeNull()
  })
})
