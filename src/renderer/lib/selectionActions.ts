export type SelectionAction = "translation" | "explanation" | "infographic" | "highlight" | "note"

import { useEffect, useRef } from "react"
import type { BoardTextSelection } from "./boardSelection"

const selectionActionByKey: Readonly<Record<string, SelectionAction>> = {
  e: "explanation",
  t: "translation",
  i: "infographic",
  h: "highlight",
  c: "note",
}

export function selectionActionForShortcut(key: string): SelectionAction | null {
  return selectionActionByKey[key.toLowerCase()] ?? null
}

/**
 * The action a key press asks for over selected text. The physical key counts, so the keys work
 * while a Korean layout is on (`T` types `ㅅ` there); with ⌘, Ctrl or ⌥ held the key is left to the
 * system, so ⌘C still copies.
 */
export function selectionActionForKey(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "repeat" | "isComposing" | "target"
  >,
): SelectionAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || event.isComposing)
    return null
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  )
    return null
  const physical = /^Key([A-Z])$/u.exec(event.code)?.[1]
  return selectionActionForShortcut(physical ?? event.key)
}

export function useSelectionShortcuts(
  selectionMenu: BoardTextSelection | null,
  onAction: (action: SelectionAction) => void,
): void {
  const onActionRef = useRef(onAction)
  useEffect(() => {
    onActionRef.current = onAction
  }, [onAction])
  useEffect(() => {
    if (!selectionMenu) return
    const handleShortcut = (event: KeyboardEvent): void => {
      const action = selectionActionForKey(event)
      if (!action) return
      event.preventDefault()
      onActionRef.current(action)
    }
    document.addEventListener("keydown", handleShortcut)
    return () => document.removeEventListener("keydown", handleShortcut)
  }, [selectionMenu])
}
