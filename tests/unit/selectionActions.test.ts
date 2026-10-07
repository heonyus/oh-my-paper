import { describe, expect, it } from "vitest"
import {
  selectionActionForKey,
  selectionActionForShortcut,
} from "../../src/renderer/lib/selectionActions"

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

  it("reads the physical key, so the keys work with a Korean layout on", () => {
    expect(selectionActionForKey(new KeyboardEvent("keydown", { key: "ㅅ", code: "KeyT" }))).toBe(
      "translation",
    )
    expect(selectionActionForKey(new KeyboardEvent("keydown", { key: "ㅊ", code: "KeyC" }))).toBe(
      "note",
    )
  })

  it("leaves ⌘C and other modified keys to the system", () => {
    expect(
      selectionActionForKey(
        new KeyboardEvent("keydown", { key: "c", code: "KeyC", metaKey: true }),
      ),
    ).toBeNull()
    expect(
      selectionActionForKey(
        new KeyboardEvent("keydown", { key: "t", code: "KeyT", ctrlKey: true }),
      ),
    ).toBeNull()
  })

  it("does not act while text is being typed", () => {
    const input = document.createElement("textarea")
    document.body.append(input)
    const event = new KeyboardEvent("keydown", { key: "t", code: "KeyT", bubbles: true })
    let action: unknown = "unset"
    input.addEventListener("keydown", (keydown) => {
      action = selectionActionForKey(keydown)
    })
    input.dispatchEvent(event)
    input.remove()
    expect(action).toBeNull()
  })
})
