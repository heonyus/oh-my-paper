import { type JSX, useSyncExternalStore } from "react"
import { useTranslator } from "../../lib/locale"
import { noteMessages } from "../../messages/note"
import type { SlashMenuStore } from "./slashCommands"

export function SlashMenu({ store }: { readonly store: SlashMenuStore }): JSX.Element | null {
  const t = useTranslator(noteMessages)
  const state = useSyncExternalStore(store.subscribe, store.snapshot)
  if (!state || !state.rect) return null
  return (
    <div
      className="note-slash-menu"
      role="listbox"
      aria-label={t("slash.menu")}
      style={{ left: state.rect.left, top: state.rect.bottom + 6 }}
      onPointerDown={(event) => event.preventDefault()}
    >
      {state.items.length === 0 ? <p className="note-slash-empty">{t("slash.empty")}</p> : null}
      {state.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === state.index}
          onClick={() => state.choose(item)}
        >
          <strong>{t(item.label)}</strong>
          <span>{t(item.hint)}</span>
        </button>
      ))}
    </div>
  )
}
