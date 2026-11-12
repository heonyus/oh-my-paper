import { useCallback, useEffect, useMemo, useState } from "react"
import type { DocumentId, DocumentRecord } from "../types"
import { rememberWindowTabs, windowTabs } from "./windowView"

/**
 * The papers open as tabs in this window's reader. A paper joins the row when it is opened,
 * from the library or anywhere else, and stays until its tab is closed; closing the tab being
 * read moves on to its neighbor. The last tab stays: the reader always has a paper.
 */
export function useReaderTabs(
  documents: readonly DocumentRecord[],
  activeId: DocumentId | null,
  onOpen: (id: DocumentId) => void,
): {
  readonly tabs: readonly DocumentRecord[]
  readonly close: (id: DocumentId) => void
} {
  const [openIds, setOpenIds] = useState<readonly string[]>(windowTabs)
  const tabs = useMemo(() => {
    const open = openIds.flatMap((id) => documents.find((document) => document.id === id) ?? [])
    const active = documents.find((document) => document.id === activeId)
    return active && !open.includes(active) ? [...open, active] : open
  }, [documents, openIds, activeId])

  const key = tabs.map((tab) => tab.id).join("\n")
  useEffect(() => {
    // Before the library has loaded there is nothing to compare the remembered row against.
    if (documents.length === 0) return
    const ids = key === "" ? [] : key.split("\n")
    setOpenIds((current) => (current.join("\n") === key ? current : ids))
    rememberWindowTabs(ids)
  }, [key, documents.length])

  const close = useCallback(
    (id: DocumentId): void => {
      const index = tabs.findIndex((tab) => tab.id === id)
      const rest = tabs.filter((tab) => tab.id !== id)
      if (index < 0 || rest.length === 0) return
      setOpenIds(rest.map((tab) => tab.id))
      const neighbor = rest[Math.min(index, rest.length - 1)]
      if (id === activeId && neighbor) onOpen(neighbor.id)
    },
    [tabs, activeId, onOpen],
  )
  return { tabs, close }
}
