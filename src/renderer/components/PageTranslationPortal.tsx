import { type JSX, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { ProviderStatus } from "../../shared/ipc"
import { researchSidebarLayout } from "../../shared/uiLayout"
import {
  closePageTranslation,
  openAutomaticPageTranslation,
  setPageTranslationDocument,
  usePageTranslationSession,
} from "../lib/pageTranslationToggle"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { PageTranslationPane } from "./PageTranslationPane"

export function visibleResearchSidebarWidth(
  flyout: string | undefined,
  mode: string | undefined,
  flyoutWidth: number,
): number {
  if (mode === "translation" || (flyout !== "open" && flyout !== "pinned"))
    return researchSidebarLayout.railWidth
  const contentWidth =
    Number.isFinite(flyoutWidth) && flyoutWidth > 0
      ? flyoutWidth
      : researchSidebarLayout.contentDefault
  return researchSidebarLayout.railWidth + contentWidth
}

export function PageTranslationPortal({
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
}): JSX.Element | null {
  const translation = usePageTranslationSession()
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() =>
    globalThis.document.querySelector<HTMLElement>(".board-world"),
  )

  useEffect(() => {
    if (portalRoot) return
    const observer = new MutationObserver(() => {
      const next = globalThis.document.querySelector<HTMLElement>(".board-world")
      if (!next) return
      setPortalRoot(next)
      observer.disconnect()
    })
    observer.observe(globalThis.document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [portalRoot])

  useEffect(() => setPageTranslationDocument(document.id), [document.id])

  useEffect(() => {
    if (translation.documentId !== document.id || !translation.auto) return
    openAutomaticPageTranslation(currentPage)
  }, [currentPage, document.id, translation.auto, translation.documentId])

  const openPages = translation.documentId === document.id ? translation.openPages : []

  return portalRoot
    ? createPortal(
        openPages.map((page) => (
          <PageTranslationPane
            key={page}
            document={document}
            currentPage={page}
            citations={citations}
            provider={provider}
            onAiRequest={onAiRequest}
            onClose={() => closePageTranslation(page)}
          />
        )),
        portalRoot,
      )
    : null
}
