import { type Editor, Extension, type Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"
import { type Locale, translator } from "../../../shared/i18n/locale"
import { type NoteMessageKey, noteMessages } from "../../messages/note"

export type SlashItem = {
  readonly id: string
  /** Catalog keys of the block's name and its one-line description. */
  readonly label: NoteMessageKey
  readonly hint: NoteMessageKey
  readonly keywords: readonly string[]
  readonly run: (editor: Editor, range: Range) => void
}

export const slashItems: readonly SlashItem[] = [
  {
    id: "heading",
    label: "slash.heading.label",
    hint: "slash.heading.hint",
    keywords: ["h2", "heading", "title"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    id: "subheading",
    label: "slash.subheading.label",
    hint: "slash.subheading.hint",
    keywords: ["h3", "subheading"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "slash.bullet.label",
    hint: "slash.bullet.hint",
    keywords: ["list", "bullet", "ul"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "slash.ordered.label",
    hint: "slash.ordered.hint",
    keywords: ["ordered", "number", "ol"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "quote",
    label: "slash.quote.label",
    hint: "slash.quote.hint",
    keywords: ["quote", "blockquote"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "slash.code.label",
    hint: "slash.code.hint",
    keywords: ["code"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "slash.divider.label",
    hint: "slash.divider.hint",
    keywords: ["hr", "divider", "line"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

/** The blocks whose name, in the reader's language, or keywords match what follows `/`. */
export function matchingSlashItems(query: string, locale: Locale = "ko"): readonly SlashItem[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return slashItems
  const t = translator(noteMessages, locale)
  return slashItems.filter(
    (item) =>
      t(item.label).toLocaleLowerCase().includes(needle) ||
      item.keywords.some((keyword) => keyword.startsWith(needle)),
  )
}

export type SlashMenuState = {
  readonly items: readonly SlashItem[]
  readonly index: number
  readonly rect: DOMRect | null
  readonly choose: (item: SlashItem) => void
}

/** Holds the open slash menu outside the editor so React can render it. */
export class SlashMenuStore {
  #state: SlashMenuState | null = null
  readonly #listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  readonly snapshot = (): SlashMenuState | null => this.#state

  set(state: SlashMenuState | null): void {
    this.#state = state
    for (const listener of this.#listeners) listener()
  }

  move(delta: number): void {
    const state = this.#state
    if (!state || state.items.length === 0) return
    const index = (state.index + delta + state.items.length) % state.items.length
    this.set({ ...state, index })
  }

  chooseCurrent(): boolean {
    const state = this.#state
    const item = state?.items[state.index]
    if (!state || !item) return false
    state.choose(item)
    return true
  }
}

/** `locale` is read on each keystroke, so the menu follows the reader's language as it changes. */
export function slashCommandExtension(store: SlashMenuStore, locale: () => Locale = () => "ko") {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: new PluginKey("slashCommand"),
          char: "/",
          allowSpaces: false,
          items: ({ query }) => [...matchingSlashItems(query, locale())],
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => ({
            onStart: (props) =>
              store.set({
                items: props.items,
                index: 0,
                rect: props.clientRect?.() ?? null,
                choose: (item) => props.command(item),
              }),
            onUpdate: (props) =>
              store.set({
                items: props.items,
                index: 0,
                rect: props.clientRect?.() ?? null,
                choose: (item) => props.command(item),
              }),
            onKeyDown: ({ event }) => {
              if (event.key === "ArrowDown") {
                store.move(1)
                return true
              }
              if (event.key === "ArrowUp") {
                store.move(-1)
                return true
              }
              if (event.key === "Enter") return store.chooseCurrent()
              if (event.key === "Escape") {
                store.set(null)
                return true
              }
              return false
            },
            onExit: () => store.set(null),
          }),
        }),
      ]
    },
  })
}
