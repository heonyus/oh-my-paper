import { ArrowUpRight, BookA, Search } from "lucide-react"
import {
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Locale } from "../../shared/i18n/locale"
import { useLocale, useTranslator } from "../lib/locale"
import {
  type ExampleState,
  useExampleTranslations,
  useVocabularyExamples,
} from "../lib/useVocabularyExamples"
import {
  buildVocabulary,
  filterVocabulary,
  sortVocabulary,
  type VocabularyEntry,
  type VocabularyExample,
  type VocabularyExampleOf,
  type VocabularySort,
  type VocabularySource,
  vocabularyByDay,
  vocabularyByPaper,
  vocabularyCsv,
  vocabularyDay,
  vocabularyMarkdown,
} from "../lib/vocabulary"
import { countKey, libraryMessages } from "../messages/library"
import type { BoardCard, CardId, DocumentId, DocumentRecord } from "../types"

export type VocabularySaveFile = (request: {
  readonly defaultName: string
  readonly content: string
}) => Promise<boolean>

const SORTS: readonly VocabularySort[] = ["recent", "paper", "alphabetical"]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** A hidden field selected and copied, for a browser that refuses the clipboard API. */
function copyThroughSelection(content: string): boolean {
  const field = document.createElement("textarea")
  field.value = content
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.opacity = "0"
  document.body.append(field)
  field.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    field.remove()
  }
}

async function copyText(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch {
    return copyThroughSelection(content)
  }
}

/** True while the window is too narrow for the list and the word side by side. */
function useNarrow(): boolean {
  const query = "(max-width: 899px)"
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches === true)
  useEffect(() => {
    const list = window.matchMedia?.(query)
    if (!list) return
    const update = (): void => setNarrow(list.matches)
    list.addEventListener("change", update)
    return () => list.removeEventListener("change", update)
  }, [])
  return narrow
}

function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

/** A sentence with the looked-up word marked. */
function Sentence({ example }: { readonly example: ExampleState }): ReactNode {
  if (typeof example === "string") return null
  const { text, wordStart, wordEnd } = example
  if (wordEnd <= wordStart) return text
  return (
    <>
      {text.slice(0, wordStart)}
      <mark>{text.slice(wordStart, wordEnd)}</mark>
      {text.slice(wordEnd)}
    </>
  )
}

/**
 * Every word translated on any paper, as a list to study from. The list gives the word and its
 * first meaning; beside it, the chosen word with all its meanings and, for each time it was
 * looked up, the sentence, that sentence translated, the paper, the page and when.
 */
export function LibraryVocabulary({
  cards,
  documents,
  onOpenCard,
  onSaveFile,
  onSaveExample,
}: {
  readonly cards: readonly BoardCard[]
  readonly documents: readonly DocumentRecord[]
  readonly onOpenCard: ((documentId: DocumentId, cardId: CardId) => void) | undefined
  readonly onSaveFile: VocabularySaveFile | undefined
  /** Keeps a translated example on its card, so it is there next time and in exports. */
  readonly onSaveExample?: ((cardId: CardId, example: VocabularyExample) => void) | undefined
}): JSX.Element {
  const t = useTranslator(libraryMessages)
  const { locale } = useLocale()
  const narrow = useNarrow()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<VocabularySort>("recent")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const exportMenu = useRef<HTMLDetailsElement>(null)
  const list = useRef<HTMLElement>(null)
  const entries = useMemo(() => buildVocabulary(cards, documents), [cards, documents])
  const visible = useMemo(
    () => sortVocabulary(filterVocabulary(entries, query), sort),
    [entries, query, sort],
  )
  const selected = visible.find((entry) => entry.key === selectedKey) ?? visible[0] ?? null

  // The export menu closes on Escape or a click elsewhere, as menus do.
  useEffect(() => {
    const close = (): void => {
      if (exportMenu.current?.open) exportMenu.current.open = false
    }
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !exportMenu.current?.contains(event.target)) close()
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [])
  const exampleOf = useVocabularyExamples(entries, documents)
  const translation = useExampleTranslations(entries, selected, exampleOf, locale, onSaveExample)
  const headings = {
    word: t("vocab.columnWord"),
    meanings: t("vocab.columnMeanings"),
    example: t("vocab.columnExample"),
    translation: t("vocab.columnTranslation"),
    sources: t("vocab.columnSources"),
  }
  const exportExample: VocabularyExampleOf = (source) => {
    const example = exampleOf(source)
    return typeof example === "string"
      ? null
      : { sentence: example.text, translation: source.example?.translation ?? null }
  }

  async function exportAs(run: () => Promise<string>): Promise<void> {
    if (exportMenu.current) exportMenu.current.open = false
    setNotice(await run())
  }
  const copy = (content: string) => async (): Promise<string> =>
    t((await copyText(content)) ? "vocab.copied" : "vocab.copyFailed")
  const save = async (): Promise<string> => {
    if (!onSaveFile) return ""
    try {
      const saved = await onSaveFile({
        defaultName: `vocabulary-${today()}.csv`,
        content: vocabularyCsv(visible, headings, exportExample),
      })
      return t(saved ? "vocab.saved" : "vocab.saveCancelled")
    } catch {
      return t("vocab.saveFailed")
    }
  }

  const dayLabel = (day: string | null): string => {
    if (day === null) return t("vocab.undated")
    const now = new Date()
    if (day === vocabularyDay(now.toISOString())) return t("vocab.today")
    if (day === vocabularyDay(new Date(now.getTime() - 86_400_000).toISOString()))
      return t("vocab.yesterday")
    const [year = 0, month = 1, date = 1] = day.split("-").map(Number)
    return new Intl.DateTimeFormat(locale, {
      ...(year === now.getFullYear() ? {} : { year: "numeric" }),
      month: "long",
      day: "numeric",
    }).format(new Date(year, month - 1, date))
  }
  const groups: readonly {
    readonly label: string | null
    readonly entries: readonly VocabularyEntry[]
  }[] =
    sort === "recent"
      ? vocabularyByDay(visible).map((group) => ({
          label: dayLabel(group.day),
          entries: group.entries,
        }))
      : sort === "paper"
        ? vocabularyByPaper(visible).map((group) => ({
            label: group.documentTitle,
            entries: group.entries,
          }))
        : [{ label: null, entries: visible }]

  /** ↑ and ↓ move through the words, as a list of words is read. */
  function moveSelection(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const order = groups.flatMap((group) => group.entries)
    const index = order.findIndex((entry) => entry.key === selected?.key)
    const next = order[index + (event.key === "ArrowDown" ? 1 : -1)]
    if (!next) return
    event.preventDefault()
    setSelectedKey(next.key)
    list.current?.querySelector<HTMLButtonElement>(`[data-word="${CSS.escape(next.key)}"]`)?.focus()
  }

  const renderSource = (source: VocabularySource): JSX.Element => {
    const example = exampleOf(source)
    const translated = source.example?.translation
    return (
      <li key={source.cardId} className="vocab-example">
        {typeof example === "string" ? (
          <p className="vocab-example-quiet">
            {t(example === "loading" ? "vocab.findingExample" : "vocab.noExample")}
          </p>
        ) : (
          <p className="vocab-example-sentence" lang="en">
            <Sentence example={example} />
          </p>
        )}
        {typeof example === "string" || locale !== "ko" ? null : translated &&
          source.example?.sentence === example.text ? (
          <p className="vocab-example-translation">{translated}</p>
        ) : translation.failed(source) ? (
          <p className="vocab-example-quiet">
            {t("vocab.translateFailed")}{" "}
            <button type="button" className="vocab-link" onClick={() => translation.retry(source)}>
              {t("vocab.retry")}
            </button>
          </p>
        ) : translation.pending(source) ? (
          <p className="vocab-example-quiet">{t("vocab.translating")}</p>
        ) : null}
        <p className="vocab-example-meta">
          <span className="vocab-example-paper">{source.documentTitle}</span>
          <span>{t("vocab.page", { page: source.page })}</span>
          {source.createdAt ? (
            <time dateTime={source.createdAt}>{formatTime(source.createdAt, locale)}</time>
          ) : null}
          {onOpenCard ? (
            <button
              type="button"
              className="vocab-link"
              aria-label={t("vocab.openSource", { title: source.documentTitle, page: source.page })}
              onClick={() => onOpenCard(source.documentId, source.cardId)}
            >
              {t("vocab.openInPaper")}
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          ) : null}
        </p>
      </li>
    )
  }

  const detail = (entry: VocabularyEntry): JSX.Element => {
    const [first, ...others] = entry.meanings
    return (
      <article className="vocab-detail" aria-labelledby="vocab-detail-word">
        <header className="vocab-detail-head">
          <h2 id="vocab-detail-word" lang="en">
            {entry.word}
          </h2>
          {first ? <p className="vocab-detail-meaning">{first}</p> : null}
          {others.length > 0 ? <p className="vocab-detail-others">{others.join(" · ")}</p> : null}
        </header>
        <h3 className="vocab-detail-label">
          {t("vocab.examples")}
          <span className="vocab-detail-count">{entry.sources.length}</span>
        </h3>
        <ol className="vocab-examples">{entry.sources.map(renderSource)}</ol>
      </article>
    )
  }

  if (entries.length === 0)
    return (
      <section className="vocab" aria-label={t("vocab.label")}>
        <div className="library-empty">
          <BookA size={24} aria-hidden="true" />
          <h2>{t("vocab.emptyTitle")}</h2>
          <p>{t("vocab.emptyBody")}</p>
        </div>
      </section>
    )

  return (
    <section className="vocab" aria-label={t("vocab.label")}>
      <div className="vocab-bar">
        <label className="vocab-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("vocab.searchPlaceholder")}
            aria-label={t("vocab.searchLabel")}
          />
        </label>
        <fieldset className="vocab-sort" aria-label={t("vocab.sortLabel")}>
          {SORTS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sort === option}
              onClick={() => setSort(option)}
            >
              {t(
                option === "recent"
                  ? "vocab.sortRecent"
                  : option === "paper"
                    ? "vocab.sortPaper"
                    : "vocab.sortAlphabetical",
              )}
            </button>
          ))}
        </fieldset>
        <p className="vocab-notice" role="status" aria-live="polite">
          {notice}
        </p>
        <details className="vocab-export" ref={exportMenu}>
          <summary>{t("vocab.export")}</summary>
          <div className="vocab-export-menu">
            <button
              type="button"
              disabled={visible.length === 0}
              onClick={() =>
                void exportAs(copy(vocabularyMarkdown(visible, headings, exportExample)))
              }
            >
              {t("vocab.copyMarkdown")}
            </button>
            <button
              type="button"
              disabled={visible.length === 0}
              onClick={() => void exportAs(copy(vocabularyCsv(visible, headings, exportExample)))}
            >
              {t("vocab.copyCsv")}
            </button>
            {onSaveFile ? (
              <button
                type="button"
                disabled={visible.length === 0}
                onClick={() => void exportAs(save)}
              >
                {t("vocab.saveCsv")}
              </button>
            ) : null}
          </div>
        </details>
      </div>
      {visible.length === 0 ? (
        <div className="library-empty is-search">
          <h2>{t("vocab.noResultsTitle")}</h2>
          <p>{t("vocab.noResultsBody")}</p>
        </div>
      ) : (
        <div className="vocab-body">
          <section className="vocab-list" ref={list} aria-label={t("vocab.wordList")}>
            {groups.map((group) => (
              <section key={group.label ?? "all"} className="vocab-group">
                {group.label ? <h3 className="vocab-group-label">{group.label}</h3> : null}
                <ul>
                  {group.entries.map((entry) => {
                    const current = entry.key === selected?.key
                    return (
                      <li key={entry.key}>
                        <button
                          type="button"
                          className="vocab-row"
                          data-word={entry.key}
                          aria-current={current ? "true" : undefined}
                          onClick={() => setSelectedKey(entry.key)}
                          onKeyDown={moveSelection}
                        >
                          <span className="vocab-row-word" lang="en">
                            {entry.word}
                          </span>
                          <span className="vocab-row-meaning">{entry.meanings[0]}</span>
                          {entry.sources.length > 1 ? (
                            <span className="vocab-row-count">
                              {t(countKey("vocab.places", entry.sources.length), {
                                count: entry.sources.length,
                              })}
                            </span>
                          ) : null}
                        </button>
                        {narrow && current ? detail(entry) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </section>
          {!narrow && selected ? <div className="vocab-detail-pane">{detail(selected)}</div> : null}
        </div>
      )}
    </section>
  )
}
