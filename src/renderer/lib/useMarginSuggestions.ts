import type { Editor } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import type { DocumentId } from "../../shared/schemas"
import { marginCandidates } from "./marginCandidates"
import { type MarginDecide, type MarginSuggestion, suggestForNote } from "./marginSuggestions"

export type MarginEntry =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly suggestions: readonly MarginSuggestion[] }
  | { readonly status: "failed" }

/** A finished sentence settles quickly; otherwise wait for a pause in typing. */
const SENTENCE_END = /(?:[.?!。…]|[다요음함임])$/u
const SETTLED_SENTENCE_MS = 400
const PAUSE_MS = 1_500
export const MIN_NOTE_CHARACTERS = 12
const MAX_ENTRIES = 80

type Options = {
  readonly enabled: boolean
  readonly documentId: DocumentId
  readonly pageCount: number
  readonly currentPage: number
  readonly decide: MarginDecide | undefined
}

function withEntry(
  entries: ReadonlyMap<string, MarginEntry>,
  key: string,
  entry: MarginEntry | null,
): ReadonlyMap<string, MarginEntry> {
  const next = new Map(entries)
  next.delete(key)
  if (entry) next.set(key, entry)
  while (next.size > MAX_ENTRIES) {
    const oldest = next.keys().next().value
    if (oldest === undefined) break
    next.delete(oldest)
  }
  return next
}

/**
 * Watches the block being written and, once a sentence settles, asks for the source paragraphs
 * it rests on or conflicts with. Results are keyed by the block's text, so an edited block never
 * shows suggestions for words it no longer contains.
 */
export function useMarginSuggestions(editor: Editor | null, options: Options) {
  const { enabled, documentId, pageCount, decide } = options
  const [entries, setEntries] = useState<ReadonlyMap<string, MarginEntry>>(() => new Map())
  const [failed, setFailed] = useState(false)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const currentPage = useRef(options.currentPage)
  currentPage.current = options.currentPage

  useEffect(() => {
    if (!editor || !enabled || !decide) return
    let timer: number | undefined
    let active: AbortController | null = null
    const update = (key: string, entry: MarginEntry | null): void =>
      setEntries((current) => withEntry(current, key, entry))
    const run = async (key: string): Promise<void> => {
      if (entriesRef.current.get(key)?.status === "ready") return
      active?.abort()
      const controller = new AbortController()
      active = controller
      update(key, { status: "loading" })
      try {
        const candidates = await marginCandidates(
          documentId,
          currentPage.current,
          pageCount,
          controller.signal,
        )
        const suggestions = await suggestForNote(key, candidates, decide, controller.signal)
        if (controller.signal.aborted) return
        update(key, { status: "ready", suggestions })
        setFailed(false)
      } catch {
        if (controller.signal.aborted) {
          update(key, null)
          return
        }
        update(key, { status: "failed" })
        setFailed(true)
      }
    }
    const onUpdate = (): void => {
      const block = editor.state.selection.$from.parent
      window.clearTimeout(timer)
      if (!block.isTextblock) return
      const key = block.textContent.trim()
      if (key.length < MIN_NOTE_CHARACTERS) return
      const delay = SENTENCE_END.test(key) ? SETTLED_SENTENCE_MS : PAUSE_MS
      timer = window.setTimeout(() => void run(key), delay)
    }
    editor.on("update", onUpdate)
    return () => {
      editor.off("update", onUpdate)
      window.clearTimeout(timer)
      active?.abort()
    }
  }, [editor, enabled, decide, documentId, pageCount])

  return { entries, failed }
}
