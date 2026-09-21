import { useCallback, useEffect, useRef, useState } from "react"
import type { DocumentPageParseProgress } from "../../shared/documentPageModel"
import type { ProviderStatus } from "../../shared/ipc"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { loadParsedDocumentPage } from "./documentPageRuntime"
import { translatePageBatch } from "./pageTranslationAi"
import {
  clearCachedPageTranslation,
  readCachedPageTranslation,
  storeCachedPageTranslation,
} from "./pageTranslationCacheRuntime"
import { withPageTranslationCitationLinks } from "./pageTranslationCitations"
import { mergePageTranslations, pause, type TranslationStatus } from "./pageTranslationPaneState"
import { runPageTranslationBatches } from "./pageTranslationRunner"
import {
  bindPageSourceBounds,
  clearPageSourceMapping,
  type PageTranslationBlock,
  pageTranslationBatches,
} from "./pageTranslationSource"
import {
  pageTranslationBlocksFromParsedPage,
  planParsedPageTranslations,
} from "./parsedPageTranslation"
import type { CitationIndexEntry } from "./pdfCitationIndex"
import { useDocumentTranslation } from "./useDocumentTranslation"

export function usePageTranslation({
  document,
  currentPage,
  citations,
  provider,
  onAiRequest,
}: {
  readonly document: DocumentRecord
  readonly currentPage: number
  readonly citations: readonly CitationIndexEntry[]
  readonly provider: ProviderStatus
  readonly onAiRequest: AiRequestRunner
}) {
  const [blocks, setBlocks] = useState<readonly PageTranslationBlock[]>([])
  const [status, setStatus] = useState<TranslationStatus>("waiting")
  const [revision, setRevision] = useState(0)
  const [progress, setProgress] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [parserStage, setParserStage] =
    useState<DocumentPageParseProgress["stage"]>("engine-starting")
  const pageStatusRef = useRef<TranslationStatus>(status)

  useEffect(() => {
    pageStatusRef.current = status
  }, [status])

  useEffect(() => {
    const completedTranslations = new Map<string, string>()
    const abortController = new AbortController()
    let cancelled = false
    const unsubscribeProgress = window.scourgify.onDocumentPageParseProgress((update) => {
      if (update.id !== document.id || update.pageNumber !== currentPage || cancelled) return
      setParserStage(update.stage)
    })
    if (revision > 0) setProgress(0)
    setBlocks([])
    setStatus("waiting")
    async function translatePage(): Promise<void> {
      try {
        await pause(0)
        if (!provider.configured) {
          setStatus("setup")
          return
        }
        setStatus("parser-running")
        setParserStage("engine-starting")
        const parsedPage = await loadParsedDocumentPage(document.id, currentPage, {
          signal: abortController.signal,
        })
        if (cancelled || abortController.signal.aborted) return
        if (!parsedPage) {
          setStatus("parser-unavailable")
          return
        }
        const cached = await readCachedPageTranslation(
          document.id,
          currentPage,
          provider,
          parsedPage.parser,
          parsedPage.configVersion,
        )
        if (cancelled || abortController.signal.aborted) return
        if (cached) {
          bindPageSourceBounds(currentPage, cached)
          await pause(0)
          if (cancelled || abortController.signal.aborted) return
          bindPageSourceBounds(currentPage, cached)
          setBlocks(cached)
          setStatus("complete")
          return
        }
        const source = pageTranslationBlocksFromParsedPage(parsedPage)
        if (source.length === 0) {
          setStatus("failed")
          return
        }
        bindPageSourceBounds(currentPage, source)
        await pause(0)
        if (cancelled || abortController.signal.aborted) return
        bindPageSourceBounds(currentPage, source)
        const plan = planParsedPageTranslations(withPageTranslationCitationLinks(source, citations))
        const completed = new Map(plan.completed)
        for (const [id, value] of completedTranslations) {
          completed.set(id, value)
        }

        const initialWithCompleted = plan.initial.map((block) => ({
          ...block,
          translation: completed.get(block.id) ?? block.translation,
        }))
        setBlocks(initialWithCompleted)

        const remainingTranslatable = plan.translatable.filter(
          (block) => !completedTranslations.has(block.id),
        )
        const batches = pageTranslationBatches(remainingTranslatable)

        if (batches.length === 0) {
          const finished = plan.initial.map((block) => ({
            ...block,
            translation: completed.get(block.id) ?? "",
          }))
          if (!finished.some((block) => !block.translation)) {
            await storeCachedPageTranslation(document.id, currentPage, provider, finished)
            setBlocks(finished)
            setStatus("complete")
            return
          }
        }

        setTotalChunks(batches.length)
        setProgress(0)
        setStatus("streaming")
        try {
          await runPageTranslationBatches(
            batches,
            async (batch) => {
              if (cancelled || abortController.signal.aborted) return new Map<string, string>()
              const translated = await translatePageBatch({
                batch,
                page: currentPage,
                onAiRequest,
                signal: abortController.signal,
                onPartial: (partial) => {
                  if (!cancelled && !abortController.signal.aborted) {
                    setBlocks((current) => mergePageTranslations(current, partial))
                  }
                },
              })
              for (const block of batch) {
                const translation = translated.get(block.id)
                if (!translation) throw new Error(`missing page translation block ${block.id}`)
                completed.set(block.id, translation)
                completedTranslations.set(block.id, translation)
              }
              if (!cancelled && !abortController.signal.aborted) {
                setProgress((value) => value + 1)
                setBlocks((current) => mergePageTranslations(current, completed))
              }
              return translated
            },
            abortController.signal,
          )
          if (cancelled || abortController.signal.aborted) return
          const finished = plan.initial.map((block) => ({
            ...block,
            translation: completed.get(block.id) ?? "",
          }))
          if (finished.some((block) => !block.translation))
            throw new Error("incomplete page translation")
          await storeCachedPageTranslation(document.id, currentPage, provider, finished)
          setBlocks(finished)
          setStatus("complete")
        } catch {
          if (cancelled || abortController.signal.aborted) return
          setBlocks((current) => mergePageTranslations(current, completed))
          setStatus("failed")
        }
      } catch {
        if (cancelled || abortController.signal.aborted) return
        setStatus("failed")
      }
    }
    void translatePage()
    return () => {
      cancelled = true
      abortController.abort()
      unsubscribeProgress()
      clearPageSourceMapping(currentPage)
    }
  }, [citations, currentPage, document, onAiRequest, provider, revision])

  const documentTranslation = useDocumentTranslation({
    document,
    citations,
    provider,
    onAiRequest,
    pageStatusRef,
    onPageBlocks: (page, nextBlocks) => {
      if (page === currentPage) {
        bindPageSourceBounds(page, nextBlocks)
        setBlocks(nextBlocks)
      }
    },
  })

  const regenerate = useCallback(async (): Promise<void> => {
    await clearCachedPageTranslation(document.id, currentPage, provider)
    setBlocks([])
    setRevision((value) => value + 1)
  }, [currentPage, document.id, provider])

  return {
    blocks,
    status,
    progress,
    totalChunks,
    parserStage,
    regenerate,
    translateAll: documentTranslation.translateAll,
    cancelAll: documentTranslation.cancelAll,
    documentProgress: documentTranslation.progress,
    documentStatus: documentTranslation.status,
    documentError: documentTranslation.error,
    documentPages: documentTranslation.pages,
  }
}
