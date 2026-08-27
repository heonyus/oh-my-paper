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

export function useSelectionShortcuts(
  selectionMenu: BoardTextSelection | null,
  onAction: (action: SelectionAction) => void,
): void {
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  useEffect(() => {
    if (!selectionMenu) return
    const handleShortcut = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return
      const action = selectionActionForShortcut(event.key)
      if (!action) return
      event.preventDefault()
      onActionRef.current(action)
    }
    document.addEventListener("keydown", handleShortcut)
    return () => document.removeEventListener("keydown", handleShortcut)
  }, [selectionMenu])
}
