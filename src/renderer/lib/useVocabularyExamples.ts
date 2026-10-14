import { useCallback, useEffect, useMemo, useState } from "react"
import type { SourceDocumentAst } from "../../shared/documentAst"
import type { Locale } from "../../shared/i18n/locale"
import type { CardId, DocumentId, DocumentRecord } from "../types"
import type { VocabularyEntry, VocabularyExample, VocabularySource } from "./vocabulary"
import { type ExampleSentence, exampleSentence } from "./vocabularyExample"

/** A source's example: the sentence, still being looked for, or not found in the paper. */
export type ExampleState = ExampleSentence | "loading" | "missing"

/** Each paper's structure, read once a session; one still being prepared is asked for again. */
const structures = new Map<string, Promise<SourceDocumentAst | null>>()

function structureOf(document: DocumentRecord): Promise<SourceDocumentAst | null> {
  const key = `${document.id}:${document.hash}`
  const known = structures.get(key)
  if (known) return known
  const request = window.ohmypaper
    .readDocumentAst({ id: document.id, sourceHash: document.hash })
    .then((result) =>
      result.status === "ready" || result.status === "degraded" ? result.ast : null,
    )
    .catch(() => null)
    .then((ast) => {
      if (!ast) structures.delete(key)
      return ast
    })
  structures.set(key, request)
  return request
}

/** A kept example, with the word found in it again for the highlight. */
function keptExample(source: VocabularySource, kept: VocabularyExample): ExampleSentence {
  const at = kept.sentence.toLocaleLowerCase("en").indexOf(source.quote.toLocaleLowerCase("en"))
  return at < 0
    ? { text: kept.sentence, wordStart: 0, wordEnd: 0 }
    : { text: kept.sentence, wordStart: at, wordEnd: at + source.quote.length }
}

/** The example sentence of each source: kept on its card, or found in its paper's structure. */
export function useVocabularyExamples(
  entries: readonly VocabularyEntry[],
  documents: readonly DocumentRecord[],
): (source: VocabularySource) => ExampleState {
  const [structuresRead, setStructuresRead] = useState<
    ReadonlyMap<DocumentId, SourceDocumentAst | null>
  >(new Map())
  const needed = useMemo(() => {
    const ids = new Set(
      entries.flatMap((entry) =>
        entry.sources.filter((source) => !source.example).map((source) => source.documentId),
      ),
    )
    return documents.filter((document) => ids.has(document.id))
  }, [entries, documents])

  useEffect(() => {
    let current = true
    for (const document of needed) {
      if (structuresRead.has(document.id)) continue
      void structureOf(document).then((ast) => {
        if (current) setStructuresRead((read) => new Map(read).set(document.id, ast))
      })
    }
    return () => {
      current = false
    }
  }, [needed, structuresRead])

  return useCallback(
    (source: VocabularySource): ExampleState => {
      if (source.example) return keptExample(source, source.example)
      if (!structuresRead.has(source.documentId)) return "loading"
      const ast = structuresRead.get(source.documentId)
      return (ast && exampleSentence(ast, source.anchor)) ?? "missing"
    },
    [structuresRead],
  )
}

/** Translations asked for, by paper and sentence, so no sentence is asked for twice. */
const translations = new Map<string, Promise<string>>()

function translated(source: VocabularySource, sentence: string, locale: Locale): Promise<string> {
  const key = `${source.documentId}:${locale}:${sentence}`
  const known = translations.get(key)
  if (known) return known
  const request = window.ohmypaper
    .runAi({
      action: "translation",
      documentId: source.documentId,
      page: source.page,
      quote: sentence,
      before: "",
      after: "",
      language: locale,
    })
    .then((result) => result.text.trim().replace(/^["“](.*)["”]$/su, "$1"))
  translations.set(key, request)
  request.catch(() => translations.delete(key))
  return request
}

/**
 * Translates the examples of the word on screen that have none yet, one at a time, and keeps
 * each on its card. A sentence another word already kept a translation of takes that one.
 * English needs no translation of an English sentence.
 */
export function useExampleTranslations(
  entries: readonly VocabularyEntry[],
  entry: VocabularyEntry | null,
  exampleOf: (source: VocabularySource) => ExampleState,
  locale: Locale,
  onSave: ((cardId: CardId, example: VocabularyExample) => void) | undefined,
): {
  readonly failed: (source: VocabularySource) => boolean
  readonly pending: (source: VocabularySource) => boolean
  readonly retry: (source: VocabularySource) => void
} {
  const [failures, setFailures] = useState<ReadonlySet<CardId>>(new Set())
  const [inFlight, setInFlight] = useState<ReadonlySet<CardId>>(new Set())
  const enabled = locale === "ko" && onSave !== undefined
  const kept = useMemo(
    () =>
      new Map(
        entries.flatMap((each) =>
          each.sources.flatMap((source) =>
            source.example ? [[source.example.sentence, source.example.translation] as const] : [],
          ),
        ),
      ),
    [entries],
  )

  const wanted = useMemo(() => {
    if (!entry || !enabled) return []
    return entry.sources.flatMap((source) => {
      const example = exampleOf(source)
      if (typeof example === "string" || failures.has(source.cardId)) return []
      return source.example?.sentence === example.text ? [] : [{ source, sentence: example.text }]
    })
  }, [entry, enabled, exampleOf, failures])

  useEffect(() => {
    if (wanted.length === 0 || !onSave) return
    let current = true
    void (async () => {
      for (const { source, sentence } of wanted) {
        if (!current) return
        const known = kept.get(sentence)
        if (known) {
          onSave(source.cardId, { sentence, translation: known })
          continue
        }
        setInFlight((set) => new Set(set).add(source.cardId))
        try {
          const translation = await translated(source, sentence, locale)
          if (translation) onSave(source.cardId, { sentence, translation })
        } catch {
          if (current) setFailures((set) => new Set(set).add(source.cardId))
        } finally {
          setInFlight((set) => {
            const next = new Set(set)
            next.delete(source.cardId)
            return next
          })
        }
      }
    })()
    return () => {
      current = false
    }
  }, [wanted, kept, locale, onSave])

  return {
    failed: (source) => failures.has(source.cardId),
    pending: (source) =>
      enabled && (inFlight.has(source.cardId) || wanted.some((item) => item.source === source)),
    retry: (source) =>
      setFailures((set) => {
        const next = new Set(set)
        next.delete(source.cardId)
        return next
      }),
  }
}
