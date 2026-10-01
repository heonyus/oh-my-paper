import { Extension, textInputRule } from "@tiptap/core"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

/** A place right after a block where the margin's cards for that block show. */
export type MarginSlot = { readonly key: string; readonly pos: number }

const slotsKey = new PluginKey<DecorationSet>("marginSlots")

/**
 * The elements the slots render into, kept by key, so a card stays mounted while the reader
 * types and the slot moves with its block.
 */
export class MarginSlotRegistry {
  readonly elements = new Map<string, HTMLElement>()

  element(key: string): HTMLElement {
    let element = this.elements.get(key)
    if (!element) {
      element = document.createElement("div")
      element.className = "note-inline-slot"
      element.contentEditable = "false"
      this.elements.set(key, element)
    }
    return element
  }

  keep(keys: ReadonlySet<string>): void {
    for (const key of this.elements.keys()) if (!keys.has(key)) this.elements.delete(key)
  }
}

export function setMarginSlots(tr: Transaction, slots: readonly MarginSlot[]): Transaction {
  return tr.setMeta(slotsKey, slots).setMeta("addToHistory", false)
}

function isSlots(value: unknown): value is readonly MarginSlot[] {
  return Array.isArray(value)
}

/**
 * Slots for the margin's cards inside the note, right under the block they answer, so a tutor
 * remark sits under the paragraph being written instead of in a column or a footer.
 */
export function marginSlotsExtension(registry: MarginSlotRegistry) {
  return Extension.create({
    name: "marginSlots",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: slotsKey,
          state: {
            init: () => DecorationSet.empty,
            apply(tr, set) {
              const slots: unknown = tr.getMeta(slotsKey)
              if (!isSlots(slots)) return set.map(tr.mapping, tr.doc)
              return DecorationSet.create(
                tr.doc,
                slots.map((slot) =>
                  Decoration.widget(slot.pos, () => registry.element(slot.key), {
                    key: slot.key,
                    side: 1,
                    ignoreSelection: true,
                    stopEvent: () => true,
                  }),
                ),
              )
            },
          },
          props: {
            decorations: (state) => slotsKey.getState(state),
          },
        }),
      ]
    },
  })
}

/** Typed arrows become arrows: `->` → and `<-` ←. */
export const ArrowInput = Extension.create({
  name: "arrowInput",
  addInputRules() {
    return [
      textInputRule({ find: /->$/u, replace: "→" }),
      textInputRule({ find: /<-$/u, replace: "←" }),
    ]
  },
})
