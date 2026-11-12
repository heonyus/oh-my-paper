import { type JSX, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ProviderStatus } from "../../shared/ipc"
import { researchSidebarLayout } from "../../shared/uiLayout"
import {
  closePageTranslation,
  openPageTranslation,
  setPageTranslationDocument,
  usePageTranslationSession,
} from "../lib/pageTranslationToggle"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { usePaperShown } from "../lib/usePaperShown"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { PageTranslationPane } from "./PageTranslationPane"

export const autoOpenDelayMs = 700

/** Pages either side of the one being read whose translations are built ahead of the reader. */
const PAGES_AHEAD = 1

/**
 * The open translations to build now. A paper remembers every page whose translation was left
 * open, and reopening it used to build all of them at once: each one parsed its page, drew
 * the page a second time and fitted its text, before the page being read had been drawn. A
 * paper read through with translation on took seconds to come back. Translations are now built
 * once the paper is showing, for the page being read and the pages beside it; one that has
 * been built stays, so a translation in progress is not cut off when the reader moves on.
 */
export function useTranslationsToBuild(
  openPages: readonly number[],
  currentPage: number,
): readonly number[] {
  const paperShown = usePaperShown()
  const [built, setBuilt] = useState<ReadonlySet<number>>(new Set())
  const near = (page: number): boolean => Math.abs(page - currentPage) <= PAGES_AHEAD
  const building = paperShown ? openPages.filter((page) => built.has(page) || near(page)) : []
  const added = building.filter((page) => !built.has(page))
  const addedKey = added.join(",")
  // biome-ignore lint/correctness/useExhaustiveDependencies: `added` is new on every render; its pages are what matter
  useEffect(() => {
    if (added.length > 0) setBuilt((current) => new Set([...current, ...added]))
  }, [addedKey])
  return building
}

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
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)

  // Looked up once the commit is done, never while rendering: when one paper's reader replaces
  // another's, render still sees the outgoing board, which the same commit then removes.
  useLayoutEffect(() => {
    const board = (): HTMLElement | null =>
      globalThis.document.querySelector<HTMLElement>(".board-world")
    const found = board()
    if (found) {
      setPortalRoot(found)
      return
    }
    const observer = new MutationObserver(() => {
      const next = board()
      if (!next) return
      setPortalRoot(next)
      observer.disconnect()
    })
    observer.observe(globalThis.document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => setPageTranslationDocument(document.id), [document.id])

  // Every page the reader stops on keeps its translation. The page on screen when automatic
  // translation is turned on opens at once; later pages only once the reader rests on them,
  // so pages scrolled past on the way elsewhere are not translated.
  const autoPageRef = useRef<number | null>(null)
  useEffect(() => {
    if (translation.documentId !== document.id || !translation.auto) {
      autoPageRef.current = null
      return
    }
    const turnedOn = autoPageRef.current === null
    autoPageRef.current = currentPage
    if (turnedOn) {
      openPageTranslation(currentPage)
      return
    }
    const timer = window.setTimeout(() => openPageTranslation(currentPage), autoOpenDelayMs)
    return () => window.clearTimeout(timer)
  }, [currentPage, document.id, translation.auto, translation.documentId])

  const openPages = useTranslationsToBuild(
    translation.documentId === document.id ? translation.openPages : [],
    currentPage,
  )

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
