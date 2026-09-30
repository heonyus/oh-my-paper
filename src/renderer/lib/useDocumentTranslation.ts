import { useCallback, useEffect, useRef, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import type { AiRequestRunner, DocumentRecord } from "../types"
import {
  type DocumentTranslationProgress,
  translateDocumentPages,
} from "./documentTranslationRunner"
import { useLocale } from "./locale"
import { pause, type TranslationStatus } from "./pageTranslationPaneState"
import type { PageTranslationBlock } from "./pageTranslationSource"
import type { CitationIndexEntry } from "./pdfCitationIndex"

export type DocumentTranslationStatus = "idle" | "running" | "complete" | "cancelled" | "failed"

type TranslationStatusRef = { readonly current: TranslationStatus }

export function useDocumentTranslation({
  document,
  citations,
  provider,
  onAiRequest,
  pageStatusRef,
  onPageBlocks,
}: {
  readonly document: DocumentRecord
  readonly citations: readonly CitationIndexEntry[]
  readonly provider: ProviderStatus
  readonly onAiRequest: AiRequestRunner
  readonly pageStatusRef: TranslationStatusRef
  readonly onPageBlocks: (page: number, blocks: readonly PageTranslationBlock[]) => void
}) {
  const { locale } = useLocale()
  const [progress, setProgress] = useState<DocumentTranslationProgress | null>(null)
  const [status, setStatus] = useState<DocumentTranslationStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<Readonly<Record<number, readonly PageTranslationBlock[]>>>({})
  const abortRef = useRef<AbortController | null>(null)
  const identity = `${document.id}:${provider.provider}:${provider.model}`

  useEffect(() => {
    if (!identity) return
    setPages({})
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [identity])

  const recordPageBlocks = useCallback(
    (page: number, blocks: readonly PageTranslationBlock[]): void => {
      setPages((current) => ({ ...current, [page]: blocks }))
      onPageBlocks(page, blocks)
    },
    [onPageBlocks],
  )

  const translateAll = useCallback(async (): Promise<void> => {
    if (status === "running" || !provider.configured) return
    await pause(0)
    if (pageStatusRef.current === "parser-running" || pageStatusRef.current === "streaming") return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus("running")
    setProgress(null)
    setError(null)
    setPages({})
    try {
      await translateDocumentPages({
        document,
        citations,
        provider,
        onAiRequest,
        signal: controller.signal,
        onProgress: setProgress,
        onPageBlocks: recordPageBlocks,
        locale,
      })
      if (controller.signal.aborted) setStatus("cancelled")
      else setStatus("complete")
    } catch (caught) {
      if (controller.signal.aborted) setStatus("cancelled")
      else if (caught instanceof Error) {
        setStatus("failed")
        setError(caught.message)
      } else throw caught
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [citations, document, locale, onAiRequest, pageStatusRef, provider, recordPageBlocks, status])

  const cancelAll = useCallback((): void => {
    abortRef.current?.abort()
  }, [])

  return { progress, status, error, pages, translateAll, cancelAll }
}
