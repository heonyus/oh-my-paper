import { ChevronDown, ChevronUp, Search, X } from "lucide-react"
import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import { useTranslator } from "../lib/locale"
import { IDLE_FIND_STATE, type PdfFindRuntime, type PdfFindState } from "../lib/pdfFindRuntime"
import { readerMessages } from "../messages/reader"

/** Whether a keystroke is the plain find shortcut: ⌘F or Ctrl+F, with no Shift. */
export function isFindShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLocaleLowerCase() === "f"
  )
}

/**
 * ⌘F: find the typed text in the open paper. Every match is marked on the pages, Enter and
 * ⇧Enter step through them, and closing the bar takes the marks away again.
 */
export function DocumentFindBar({
  runtime,
}: {
  readonly runtime: PdfFindRuntime | null
}): JSX.Element | null {
  const t = useTranslator(readerMessages)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [state, setState] = useState<PdfFindState>(IDLE_FIND_STATE)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const restoreFocus = useCallback((): void => {
    requestAnimationFrame(() => previousFocusRef.current?.focus())
  }, [])

  const close = useCallback((): void => {
    runtime?.close()
    setOpen(false)
    restoreFocus()
  }, [restoreFocus, runtime])

  useEffect(() => {
    if (!runtime) {
      setState(IDLE_FIND_STATE)
      return
    }
    setState(runtime.state())
    return runtime.subscribe(setState)
  }, [runtime])

  // A query typed before the paper's text was ready runs once the runtime arrives.
  useEffect(() => {
    if (open && runtime && query) runtime.find(query)
  }, [open, query, runtime])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && open) {
        event.preventDefault()
        close()
        return
      }
      if (!isFindShortcut(event)) return
      event.preventDefault()
      if (!open) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        setOpen(true)
        return
      }
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [close, open])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  if (!open) return null

  const hasMatches = state.total > 0
  const count = !query.trim()
    ? ""
    : !runtime || state.status === "pending"
      ? t("find.pending")
      : hasMatches
        ? t("find.count", { current: state.current, total: state.total })
        : t("find.none")

  return (
    // biome-ignore lint/a11y/useSemanticElements: the tests' DOM does not yet give <search> its role
    <div
      className="document-find-bar"
      role="search"
      aria-label={t("find.dialog")}
      data-status={state.status}
    >
      <Search size={15} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        aria-label={t("find.input")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          runtime?.find(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return
          event.preventDefault()
          if (event.shiftKey) runtime?.previous()
          else runtime?.next()
        }}
        placeholder={t("find.placeholder")}
        autoComplete="off"
        spellCheck={false}
      />
      <span className="document-find-count" role="status" aria-live="polite">
        {count}
      </span>
      <button
        type="button"
        aria-label={t("find.previous")}
        disabled={!hasMatches}
        onClick={() => runtime?.previous()}
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        aria-label={t("find.next")}
        disabled={!hasMatches}
        onClick={() => runtime?.next()}
      >
        <ChevronDown size={16} />
      </button>
      <button type="button" aria-label={t("find.close")} onClick={close}>
        <X size={16} />
      </button>
    </div>
  )
}
