import type { EventBus } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"

/** PDF.js's `FindState`, repeated here so the find bar never loads the viewer module itself. */
const FindState = { FOUND: 0, NOT_FOUND: 1, WRAPPED: 2, PENDING: 3 } as const

export type PdfFindStatus = "idle" | "pending" | "found" | "wrapped" | "notFound"

export type PdfFindState = {
  readonly query: string
  readonly status: PdfFindStatus
  /** The selected match's place among every match in the paper, from 1; 0 while there is none. */
  readonly current: number
  readonly total: number
}

/** Plain text find over the open paper, the way a browser's ⌘F works. */
export type PdfFindRuntime = {
  readonly find: (query: string) => void
  readonly next: () => void
  readonly previous: () => void
  /** Ends the search and takes every match highlight off the pages. */
  readonly close: () => void
  readonly state: () => PdfFindState
  readonly subscribe: (listener: (state: PdfFindState) => void) => () => void
}

export type PdfFindSession = {
  readonly runtime: PdfFindRuntime
  readonly dispose: () => void
}

type FindBus = Pick<EventBus, "on" | "off" | "dispatch">

type MatchesCount = { readonly current: number; readonly total: number }

export const IDLE_FIND_STATE: PdfFindState = { query: "", status: "idle", current: 0, total: 0 }

function statusOf(state: number, total: number): PdfFindStatus {
  if (state === FindState.PENDING) return "pending"
  if (state === FindState.NOT_FOUND || total === 0) return "notFound"
  if (state === FindState.WRAPPED) return "wrapped"
  return "found"
}

/** The find state kept in step with PDF.js's find controller through its event bus. */
export function createPdfFindRuntime(eventBus: FindBus): PdfFindSession {
  let current = IDLE_FIND_STATE
  const listeners = new Set<(state: PdfFindState) => void>()
  const source = {}

  function publish(next: PdfFindState): void {
    current = next
    for (const listener of listeners) listener(next)
  }

  function dispatchFind(type: "" | "again", findPrevious: boolean): void {
    eventBus.dispatch("find", {
      source,
      type,
      query: current.query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    })
  }

  const handleControlState = ({
    state,
    matchesCount,
  }: {
    readonly state: number
    readonly matchesCount: MatchesCount
  }): void => {
    if (!current.query) return
    publish({
      ...current,
      status: statusOf(state, matchesCount.total),
      current: matchesCount.current,
      total: matchesCount.total,
    })
  }
  const handleMatchesCount = ({ matchesCount }: { readonly matchesCount: MatchesCount }): void => {
    if (!current.query) return
    publish({ ...current, current: matchesCount.current, total: matchesCount.total })
  }
  eventBus.on("updatefindcontrolstate", handleControlState)
  eventBus.on("updatefindmatchescount", handleMatchesCount)

  const runtime: PdfFindRuntime = {
    find: (query) => {
      if (!query) {
        publish(IDLE_FIND_STATE)
        eventBus.dispatch("findbarclose", { source })
        return
      }
      publish({ query, status: "pending", current: 0, total: 0 })
      dispatchFind("", false)
    },
    next: () => {
      if (!current.query) return
      dispatchFind("again", false)
    },
    previous: () => {
      if (!current.query) return
      dispatchFind("again", true)
    },
    close: () => {
      publish(IDLE_FIND_STATE)
      eventBus.dispatch("findbarclose", { source })
    },
    state: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  return {
    runtime,
    dispose: () => {
      eventBus.off("updatefindcontrolstate", handleControlState)
      eventBus.off("updatefindmatchescount", handleMatchesCount)
      listeners.clear()
    },
  }
}
