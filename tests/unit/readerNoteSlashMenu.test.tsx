import { act, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SlashMenu } from "../../src/renderer/components/readerNote/SlashMenu"
import {
  matchingSlashItems,
  SlashMenuStore,
} from "../../src/renderer/components/readerNote/slashCommands"

function NotePane({ store }: { readonly store: SlashMenuStore }) {
  const anchor = useRef<HTMLDivElement>(null)
  return (
    <div className="app-shell" data-theme="dark">
      <section className="note-pane">
        <div ref={anchor} className="note-editor">
          <SlashMenu store={store} anchor={anchor} />
        </div>
      </section>
    </div>
  )
}

describe("reader note slash menu", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "ohmypaper")
  })

  it("opens outside the note pane, which would otherwise place it off screen", () => {
    const store = new SlashMenuStore()
    render(<NotePane store={store} />)
    act(() =>
      store.set({
        items: matchingSlashItems(""),
        index: 0,
        rect: new DOMRect(500, 200, 0, 16),
        choose: vi.fn(),
      }),
    )

    const menu = screen.getByRole("listbox", { name: "블록 추가" })
    expect(menu.closest(".note-pane")).toBeNull()
    expect(menu.parentElement).toHaveClass("app-shell")
    expect(menu).toHaveStyle({ left: "500px", top: "222px" })
  })

  it("opens above the cursor when the window ends below it", () => {
    const store = new SlashMenuStore()
    render(<NotePane store={store} />)
    act(() =>
      store.set({
        items: matchingSlashItems(""),
        index: 0,
        rect: new DOMRect(40, window.innerHeight - 30, 0, 16),
        choose: vi.fn(),
      }),
    )

    expect(screen.getByRole("listbox", { name: "블록 추가" })).toHaveStyle({ bottom: "36px" })
  })

  it("offers images only where the collection can keep them", () => {
    expect(matchingSlashItems("image").map((item) => item.id)).toEqual([])

    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { collection: { importAsset: vi.fn() } },
    })

    expect(matchingSlashItems("image").map((item) => item.id)).toEqual(["image"])
    expect(matchingSlashItems("이미지").map((item) => item.id)).toEqual(["image"])
  })
})
