import { type CSSProperties, type JSX, type RefObject, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { useTranslator } from "../../lib/locale"
import { noteMessages } from "../../messages/note"
import type { SlashMenuStore } from "./slashCommands"

const MENU_WIDTH = 220
const MENU_MAX_HEIGHT = 320
const GAP = 6

/** Under the cursor, or above it when the window ends first; never past the right edge. */
function menuPlacement(rect: DOMRect): CSSProperties {
  const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - MENU_WIDTH - GAP))
  return rect.bottom + GAP + MENU_MAX_HEIGHT <= window.innerHeight
    ? { left, top: rect.bottom + GAP }
    : { left, bottom: window.innerHeight - rect.top + GAP }
}

/**
 * The menu is placed in window coordinates, so it renders outside the note pane: the pane is a
 * size container, which would make it the box a fixed menu is placed in. It stays inside the app
 * shell to keep the shell's theme.
 */
export function SlashMenu({
  store,
  anchor,
}: {
  readonly store: SlashMenuStore
  readonly anchor?: RefObject<HTMLElement | null> | undefined
}): JSX.Element | null {
  const t = useTranslator(noteMessages)
  const state = useSyncExternalStore(store.subscribe, store.snapshot)
  if (!state?.rect) return null
  return createPortal(
    <div
      className="note-slash-menu"
      role="listbox"
      aria-label={t("slash.menu")}
      style={menuPlacement(state.rect)}
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
    </div>,
    anchor?.current?.closest(".app-shell") ?? document.body,
  )
}
