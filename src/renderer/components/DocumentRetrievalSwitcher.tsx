import { Search, X } from "lucide-react"
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslator } from "../lib/locale"
import type { PdfRetrievalRuntime } from "../lib/pdfRetrievalRuntime"
import { rankPdfPassages } from "../lib/pdfSearch"
import { readerMessages } from "../messages/reader"

export function DocumentRetrievalSwitcher({
  runtime,
}: {
  readonly runtime: PdfRetrievalRuntime | null
}): JSX.Element | null {
  const t = useTranslator(readerMessages)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const results = useMemo(
    () => (runtime ? rankPdfPassages(runtime.index, query) : []),
    [query, runtime],
  )

  const restoreFocus = useCallback((): void => {
    requestAnimationFrame(() => previousFocusRef.current?.focus())
  }, [])

  function close(clearHighlight: boolean): void {
    if (clearHighlight) runtime?.clear()
    setOpen(false)
    restoreFocus()
  }

  function moveActive(delta: number): void {
    if (results.length === 0) return
    setActiveIndex((current) => (current + delta + results.length) % results.length)
  }

  function activate(resultIndex = activeIndex): void {
    const result = results[resultIndex]
    if (!result || !runtime) return
    runtime.activate(result, query)
    setOpen(false)
    restoreFocus()
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && open) {
        event.preventDefault()
        runtime?.clear()
        setOpen(false)
        restoreFocus()
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== "f") return
      event.preventDefault()
      if (!open) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        setActiveIndex(0)
        runtime?.clear()
        setOpen(true)
        return
      }
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [open, restoreFocus, runtime])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    const active = resultsRef.current?.querySelector<HTMLElement>(
      `[data-result-index="${activeIndex}"]`,
    )
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [activeIndex])

  if (!open) return null

  return (
    <div className="document-retrieval-layer">
      <button
        type="button"
        className="document-retrieval-backdrop"
        aria-label={t("search.close")}
        tabIndex={-1}
        onClick={() => close(true)}
      />
      <section
        className="document-retrieval-switcher"
        role="dialog"
        aria-modal="true"
        aria-label={t("search.dialog")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            close(true)
          } else if (event.key === "Tab") {
            event.preventDefault()
            moveActive(event.shiftKey ? -1 : 1)
          } else if (event.key === "Enter") {
            event.preventDefault()
            activate()
          }
        }}
      >
        <div className="document-retrieval-query">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            aria-label={t("search.input")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
              runtime?.clear()
            }}
            placeholder={t("search.placeholder")}
          />
          <span className="document-retrieval-count" role="status" aria-live="polite">
            {query.trim() ? t("search.count", { count: results.length }) : t("search.whole")}
          </span>
          <kbd>⌘F</kbd>
          <button type="button" aria-label={t("search.close")} onClick={() => close(true)}>
            <X size={17} />
          </button>
        </div>
        <div
          ref={resultsRef}
          className="document-retrieval-results"
          role="listbox"
          aria-label={t("search.results")}
        >
          {!query.trim() ? (
            <p className="document-retrieval-empty">{t("search.hint")}</p>
          ) : !runtime ? (
            <p className="document-retrieval-empty">{t("search.indexing")}</p>
          ) : results.length === 0 ? (
            <p className="document-retrieval-empty">{t("search.none")}</p>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex}
                data-result-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => activate(index)}
              >
                <span className="document-retrieval-rank">
                  {String(result.rank).padStart(2, "0")}
                </span>
                <span className="document-retrieval-meta">
                  <strong>p. {result.page}</strong>
                  <span>{t("search.relevance", { relevance: result.relevance })}</span>
                </span>
                <span className="document-retrieval-snippet">{result.snippet}</span>
              </button>
            ))
          )}
        </div>
        <footer>
          <span>{t("search.keyTab")}</span>
          <span>{t("search.keyEnter")}</span>
          <span>{t("search.keyEsc")}</span>
        </footer>
      </section>
    </div>
  )
}
