import { type Editor, Extension, type Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"

export type SlashItem = {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly keywords: readonly string[]
  readonly run: (editor: Editor, range: Range) => void
}

export const slashItems: readonly SlashItem[] = [
  {
    id: "heading",
    label: "제목",
    hint: "큰 제목",
    keywords: ["h2", "heading", "title"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    id: "subheading",
    label: "소제목",
    hint: "작은 제목",
    keywords: ["h3", "subheading"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "목록",
    hint: "글머리 기호 목록",
    keywords: ["list", "bullet", "ul"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "번호 목록",
    hint: "순서가 있는 목록",
    keywords: ["ordered", "number", "ol"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "quote",
    label: "인용",
    hint: "원문이나 생각을 인용",
    keywords: ["quote", "blockquote"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "코드",
    hint: "코드 블록",
    keywords: ["code"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "구분선",
    hint: "단락 나누기",
    keywords: ["hr", "divider", "line"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

export function matchingSlashItems(query: string): readonly SlashItem[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return slashItems
  return slashItems.filter(
    (item) =>
      item.label.includes(needle) || item.keywords.some((keyword) => keyword.startsWith(needle)),
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

export function slashCommandExtension(store: SlashMenuStore) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: new PluginKey("slashCommand"),
          char: "/",
          allowSpaces: false,
          items: ({ query }) => [...matchingSlashItems(query)],
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
