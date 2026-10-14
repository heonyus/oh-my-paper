import { BookA, Copy, Download, FileText, Search } from "lucide-react"
import { type JSX, useMemo, useState } from "react"
import { useTranslator } from "../lib/locale"
import {
  buildVocabulary,
  filterVocabulary,
  sortVocabulary,
  type VocabularyEntry,
  type VocabularySort,
  vocabularyByPaper,
  vocabularyCsv,
  vocabularyMarkdown,
} from "../lib/vocabulary"
import { countKey, libraryMessages } from "../messages/library"
import type { BoardCard, CardId, DocumentId, DocumentRecord } from "../types"

export type VocabularySaveFile = (request: {
  readonly defaultName: string
  readonly content: string
}) => Promise<boolean>

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

/**
 * Every word translated on any paper, as one list to study from: searchable, sorted by word
 * or by paper, and copied or saved as a table. A source opens the paper at the word.
 */
export function LibraryVocabulary({
  cards,
  documents,
  onOpenCard,
  onSaveFile,
}: {
  readonly cards: readonly BoardCard[]
  readonly documents: readonly DocumentRecord[]
  readonly onOpenCard: ((documentId: DocumentId, cardId: CardId) => void) | undefined
  readonly onSaveFile: VocabularySaveFile | undefined
}): JSX.Element {
  const t = useTranslator(libraryMessages)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<VocabularySort>("paper")
  const [notice, setNotice] = useState<string | null>(null)
  const entries = useMemo(() => buildVocabulary(cards, documents), [cards, documents])
  const visible = useMemo(
    () => sortVocabulary(filterVocabulary(entries, query), sort),
    [entries, query, sort],
  )
  const headings = {
    word: t("vocab.columnWord"),
    meanings: t("vocab.columnMeanings"),
    sources: t("vocab.columnSources"),
  }

  async function copy(content: string): Promise<void> {
    setNotice(t((await copyText(content)) ? "vocab.copied" : "vocab.copyFailed"))
  }
  async function save(): Promise<void> {
    if (!onSaveFile) return
    try {
      const saved = await onSaveFile({
        defaultName: `vocabulary-${today()}.csv`,
        content: vocabularyCsv(visible, headings),
      })
      setNotice(t(saved ? "vocab.saved" : "vocab.saveCancelled"))
    } catch {
      setNotice(t("vocab.saveFailed"))
    }
  }

  const renderEntry = (entry: VocabularyEntry, paper: DocumentId | null): JSX.Element => (
    <li key={entry.key} className="library-vocabulary-entry">
      <strong className="library-vocabulary-word" lang="en">
        {entry.word}
      </strong>
      <ol className="library-vocabulary-meanings">
        {entry.meanings.map((meaning) => (
          <li key={meaning}>{meaning}</li>
        ))}
      </ol>
      <ul className="library-vocabulary-sources" aria-label={t("vocab.sources")}>
        {entry.sources.map((source) => (
          <li key={source.cardId}>
            <button
              type="button"
              title={source.quote}
              aria-label={t("vocab.openSource", {
                title: source.documentTitle,
                page: source.page,
              })}
              disabled={!onOpenCard}
              onClick={() => onOpenCard?.(source.documentId, source.cardId)}
            >
              <FileText size={12} aria-hidden="true" />
              {source.documentId === paper ? null : <span>{source.documentTitle}</span>}
              <small>{t("vocab.page", { page: source.page })}</small>
            </button>
          </li>
        ))}
      </ul>
    </li>
  )

  return (
    <section className="library-vocabulary" aria-label={t("vocab.label")}>
      <p className="library-vocabulary-intro">{t("vocab.intro")}</p>
      <div className="library-vocabulary-toolbar">
        <label className="library-vocabulary-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("vocab.searchPlaceholder")}
            aria-label={t("vocab.searchLabel")}
          />
        </label>
        <fieldset className="library-vocabulary-sort" aria-label={t("vocab.sortLabel")}>
          {(["paper", "alphabetical"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sort === option}
              className={sort === option ? "active" : undefined}
              onClick={() => setSort(option)}
            >
              {t(option === "paper" ? "vocab.sortPaper" : "vocab.sortAlphabetical")}
            </button>
          ))}
        </fieldset>
        <div className="library-vocabulary-export">
          <button
            type="button"
            disabled={visible.length === 0}
            onClick={() => void copy(vocabularyMarkdown(visible, headings))}
          >
            <Copy size={14} aria-hidden="true" />
            <span>{t("vocab.copyMarkdown")}</span>
          </button>
          <button
            type="button"
            disabled={visible.length === 0}
            onClick={() => void copy(vocabularyCsv(visible, headings))}
          >
            <Copy size={14} aria-hidden="true" />
            <span>{t("vocab.copyCsv")}</span>
          </button>
          {onSaveFile ? (
            <button type="button" disabled={visible.length === 0} onClick={() => void save()}>
              <Download size={14} aria-hidden="true" />
              <span>{t("vocab.saveCsv")}</span>
            </button>
          ) : null}
        </div>
      </div>
      <p className="library-vocabulary-notice" role="status" aria-live="polite">
        {notice}
      </p>
      {entries.length === 0 ? (
        <div className="library-empty">
          <BookA size={24} aria-hidden="true" />
          <h2>{t("vocab.emptyTitle")}</h2>
          <p>{t("vocab.emptyBody")}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="library-empty is-search">
          <h2>{t("vocab.noResultsTitle")}</h2>
          <p>{t("vocab.noResultsBody")}</p>
        </div>
      ) : sort === "paper" ? (
        vocabularyByPaper(visible).map((group) => (
          <section
            key={group.documentId}
            className="library-vocabulary-paper"
            aria-label={group.documentTitle}
          >
            <h3>
              <span>{group.documentTitle}</span>
              <small>
                {t(countKey("vocab.count", group.entries.length), {
                  count: group.entries.length,
                })}
              </small>
            </h3>
            <ol className="library-vocabulary-list">
              {group.entries.map((entry) => renderEntry(entry, group.documentId))}
            </ol>
          </section>
        ))
      ) : (
        <ol className="library-vocabulary-list">
          {visible.map((entry) => renderEntry(entry, null))}
        </ol>
      )}
    </section>
  )
}
