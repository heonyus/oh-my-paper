import type { Editor } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import type { MeaningSearchRequest, MeaningSearchResult } from "../../shared/meaningSearch"
import type { DocumentId } from "../../shared/schemas"
import type { AiRequestRunner } from "../types"
import { waitForDocumentAst } from "./documentAstRuntime"
import { earlierLines, hasTextBlock } from "./noteBlocks"
import {
  confidentSource,
  type NoteSource,
  noteSourceCandidates,
  relatedSources,
  type ScoredSource,
  sourceSearchText,
} from "./noteSources"
import { cleanTutorText, type EarlierNote, noteTutorRequest, visibleTutorText } from "./noteTutor"
import { cachedTranslationForPassage } from "./pageTranslationCacheRuntime"
import { pageTextsWithParsedPages } from "./pdfSearch"

export type CompanionDensity = "quiet" | "normal" | "active"
export type RankByMeaning = (
  request: MeaningSearchRequest,
  signal?: AbortSignal,
) => Promise<MeaningSearchResult>

export type SourceMatch = {
  /** The note block text this match was made for. */
  readonly key: string
  readonly source: ScoredSource
  readonly translation: string | null
}

export type TutorEntry = {
  readonly key: string
  readonly status: "streaming" | "done"
  readonly text: string
  readonly at: number
}

/** A finished sentence settles quickly; otherwise wait for a pause in typing. */
const SENTENCE_END = /(?:[.?!。…]|[다요음함임])$/u
const MATCH_AFTER_SENTENCE_MS = 400
const MATCH_AFTER_PAUSE_MS = 1_200
const MIN_MATCH_CHARACTERS = 12
const MIN_TUTOR_CHARACTERS = 20
const MAX_TUTOR_ENTRIES = 30
const EARLIER_NOTE_MINIMUM = 0.5
const AST_WAIT_MS = 5_000
/**
 * How long the reader rests before the tutor answers. Notes are often fragments ("…다면", a list
 * item) that never end like a sentence, so a pause in typing is enough; a finished sentence is
 * answered sooner.
 */
const tutorPauseMs: Readonly<Record<Exclude<CompanionDensity, "quiet">, number>> = {
  normal: 1_500,
  active: 800,
}
const TUTOR_AFTER_SENTENCE_MS = 600
const tutorCooldownMs: Readonly<Record<Exclude<CompanionDensity, "quiet">, number>> = {
  normal: 8_000,
  active: 3_000,
}

type Options = {
  readonly density: CompanionDensity
  readonly documentId: DocumentId
  readonly pageCount: number
  readonly currentPage: number
  readonly earlierNotes: readonly EarlierNote[]
  readonly rank: RankByMeaning | undefined
  readonly onAiRequest: AiRequestRunner
}

function candidatesOf(sources: readonly NoteSource[]) {
  return sources.map((source) => ({ id: source.id, text: sourceSearchText(source) }))
}

function noteCandidatesOf(notes: readonly EarlierNote[]) {
  return notes.map(({ id, text }) => ({ id, text }))
}

/**
 * Follows the block being written. Once a sentence settles it finds the source passage the
 * sentence clearly rests on (locally, by meaning); once a paragraph settles it asks the tutor to
 * build on it. Nothing here writes into the note.
 */
export function useNoteCompanion(editor: Editor | null, options: Options) {
  const { density, documentId, pageCount, rank } = options
  const [match, setMatch] = useState<SourceMatch | null>(null)
  const [tutors, setTutors] = useState<readonly TutorEntry[]>([])
  const [failed, setFailed] = useState(false)
  const [currentKey, setCurrentKey] = useState("")
  const live = useRef(options)
  live.current = options

  useEffect(() => {
    if (!editor || density === "quiet" || !rank) return
    let matchTimer: number | undefined
    let tutorTimer: number | undefined
    let retryTimer: number | undefined
    let matchRun: AbortController | null = null
    let tutorRun: AbortController | null = null
    let lastTutorAt = 0
    let previous: { readonly pos: number; readonly key: string } | null = null
    /** The latest paragraph that settled while the tutor was busy or cooling down. */
    let waiting: { readonly key: string; readonly context: string } | null = null
    const tutored = new Set<string>()
    const putTutor = (key: string, entry: TutorEntry | null): void =>
      setTutors((current) =>
        [...current.filter((item) => item.key !== key), ...(entry ? [entry] : [])].slice(
          -MAX_TUTOR_ENTRIES,
        ),
      )
    const sources = (signal: AbortSignal): Promise<readonly NoteSource[]> =>
      noteSourceCandidates(documentId, live.current.currentPage, pageCount, signal)

    const runMatch = async (key: string): Promise<void> => {
      matchRun?.abort()
      const controller = new AbortController()
      matchRun = controller
      try {
        const list = await sources(controller.signal)
        if (list.length === 0) return
        const ranked = await rank(
          { query: key, candidates: candidatesOf(list), limit: 5 },
          controller.signal,
        )
        if (controller.signal.aborted) return
        const source = confidentSource(ranked.results, list)
        setMatch(
          source
            ? {
                key,
                source,
                translation: cachedTranslationForPassage(documentId, source.page, source.text),
              }
            : null,
        )
        setFailed(false)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }

    /** Gives the waiting paragraph its turn once the cooldown ends, if it is still in the note. */
    const retryWhenCool = (): void => {
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(
        () => {
          const next = waiting
          waiting = null
          if (next && hasTextBlock(editor, next.key)) void runTutor(next.key, next.context)
        },
        Math.max(0, lastTutorAt + tutorCooldownMs[density] - Date.now()),
      )
    }

    const runTutor = async (key: string, context: string): Promise<void> => {
      if (tutored.has(key)) return
      if (tutorRun || Date.now() - lastTutorAt < tutorCooldownMs[density]) {
        waiting = { key, context }
        if (!tutorRun) retryWhenCool()
        return
      }
      tutored.add(key)
      lastTutorAt = Date.now()
      const controller = new AbortController()
      tutorRun = controller
      const at = Date.now()
      try {
        const list = await sources(controller.signal)
        const ranked = list.length
          ? await rank({ query: key, candidates: candidatesOf(list), limit: 5 }, controller.signal)
          : { results: [] }
        const notes = live.current.earlierNotes
        const earlier = notes.length
          ? await rank(
              { query: key, candidates: noteCandidatesOf(notes.slice(-200)), limit: 2 },
              controller.signal,
            )
          : { results: [] }
        const earlierMatches = earlier.results
          .filter((result) => result.score >= EARLIER_NOTE_MINIMUM)
          .flatMap((result) => notes.filter((note) => note.id === result.id))
        const ast = await waitForDocumentAst(documentId, AST_WAIT_MS, controller.signal)
        const pageTexts = ast ? pageTextsWithParsedPages(ast) : []
        let streamed = ""
        const request = noteTutorRequest({
          paragraph: key,
          earlierLines: context,
          passages: relatedSources(ranked.results, list),
          earlierNotes: earlierMatches,
          page: live.current.currentPage,
        })
        const full = await live.current.onAiRequest(
          request,
          (delta) => {
            streamed += delta
            putTutor(key, {
              key,
              status: "streaming",
              text: visibleTutorText(streamed, pageTexts),
              at,
            })
          },
          controller.signal,
        )
        const cleaned = cleanTutorText(full, pageTexts)
        putTutor(key, cleaned ? { key, status: "done", text: cleaned, at } : null)
      } catch {
        putTutor(key, null)
      } finally {
        if (tutorRun === controller) tutorRun = null
        if (waiting && !controller.signal.aborted) retryWhenCool()
      }
    }

    const onChange = (): void => {
      const { $from } = editor.state.selection
      const block = $from.parent
      const pos = $from.depth > 0 ? $from.before($from.depth) : 0
      const key = block.isTextblock ? block.textContent.trim() : ""
      if (previous && previous.pos !== pos && previous.key.length >= MIN_TUTOR_CHARACTERS) {
        void runTutor(previous.key, earlierLines(editor, previous.pos))
      }
      previous = { pos, key }
      setCurrentKey(key)
      window.clearTimeout(matchTimer)
      window.clearTimeout(tutorTimer)
      if (key.length < MIN_MATCH_CHARACTERS) return
      const settled = SENTENCE_END.test(key)
      matchTimer = window.setTimeout(
        () => void runMatch(key),
        settled ? MATCH_AFTER_SENTENCE_MS : MATCH_AFTER_PAUSE_MS,
      )
      if (key.length >= MIN_TUTOR_CHARACTERS) {
        tutorTimer = window.setTimeout(
          () => void runTutor(key, earlierLines(editor, pos)),
          settled ? TUTOR_AFTER_SENTENCE_MS : tutorPauseMs[density],
        )
      }
    }
    editor.on("update", onChange)
    editor.on("selectionUpdate", onChange)
    return () => {
      editor.off("update", onChange)
      editor.off("selectionUpdate", onChange)
      window.clearTimeout(matchTimer)
      window.clearTimeout(tutorTimer)
      window.clearTimeout(retryTimer)
      matchRun?.abort()
      tutorRun?.abort()
    }
  }, [editor, density, documentId, pageCount, rank])

  /** The match only counts while the reader is still in the sentence it was made for. */
  const liveMatch = match && match.key === currentKey ? match : null
  return { match: liveMatch, tutors, failed }
}
