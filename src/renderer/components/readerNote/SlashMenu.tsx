import { type JSX, useSyncExternalStore } from "react"
import type { SlashMenuStore } from "./slashCommands"

export function SlashMenu({ store }: { readonly store: SlashMenuStore }): JSX.Element | null {
  const state = useSyncExternalStore(store.subscribe, store.snapshot)
  if (!state || !state.rect) return null
  return (
    <div
      className="note-slash-menu"
      role="listbox"
      aria-label="블록 추가"
      style={{ left: state.rect.left, top: state.rect.bottom + 6 }}
      onPointerDown={(event) => event.preventDefault()}
    >
      {state.items.length === 0 ? <p className="note-slash-empty">맞는 블록이 없습니다</p> : null}
      {state.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === state.index}
          onClick={() => state.choose(item)}
        >
          <strong>{item.label}</strong>
          <span>{item.hint}</span>
        </button>
      ))}
    </div>
  )
}
