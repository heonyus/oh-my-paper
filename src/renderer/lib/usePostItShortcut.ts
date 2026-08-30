import { useEffect } from "react"
import type { BoardTool } from "../types"

export function usePostItShortcut(onToolChange: (tool: BoardTool) => void): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey) return
      if (!(event.target instanceof HTMLElement)) return
      if (event.target.closest("input, textarea, [contenteditable='true']")) return
      event.preventDefault()
      onToolChange("sticky")
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [onToolChange])
}
