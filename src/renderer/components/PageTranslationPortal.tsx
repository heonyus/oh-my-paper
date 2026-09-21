import { type JSX, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ProviderStatus } from "../../shared/ipc"
import { pageTranslationLayout, researchSidebarLayout } from "../../shared/uiLayout"
import {
  closePageTranslation,
  openAutomaticPageTranslation,
  setPageTranslationDocument,
  usePageTranslationSession,
} from "../lib/pageTranslationToggle"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { pageTranslationWorldPlacement } from "../lib/usePageTranslationPlacement"
import { fitWorldRectHorizontally } from "../lib/viewport"
import type { AiRequestRunner, DocumentRecord, Viewport } from "../types"
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
  viewport,
  onViewportChange,
  sidebarReservedWidth = researchSidebarLayout.railWidth,
}: {
  readonly document: DocumentRecord
  readonly currentPage: number
  readonly citations: readonly CitationIndexEntry[]
  readonly provider: ProviderStatus
  readonly onAiRequest: AiRequestRunner
  readonly viewport?: Viewport | undefined
  readonly onViewportChange?: ((viewport: Viewport) => void) | undefined
  readonly sidebarReservedWidth?: number | undefined
}): JSX.Element | null {
  const translation = usePageTranslationSession()
  const [world, setWorld] = useState<HTMLElement | null>(() =>
    globalThis.document.querySelector<HTMLElement>(".board-world"),
  )
  const revealedPages = useRef(new Set<number>())
  const fittedSidebarWidth = useRef(sidebarReservedWidth)

  useEffect(() => {
    if (world) return
    const observer = new MutationObserver(() => {
      const next = globalThis.document.querySelector<HTMLElement>(".board-world")
      if (!next) return
      setWorld(next)
      observer.disconnect()
    })
    observer.observe(globalThis.document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [world])

  useEffect(() => setPageTranslationDocument(document.id), [document.id])

  useEffect(() => {
    if (translation.documentId !== document.id || !translation.auto) return
    openAutomaticPageTranslation(currentPage)
  }, [currentPage, document.id, translation.auto, translation.documentId])

  const openPages = translation.documentId === document.id ? translation.openPages : []

  useEffect(() => {
    for (const page of revealedPages.current)
      if (!openPages.includes(page)) revealedPages.current.delete(page)
    const sidebarWidthChanged = fittedSidebarWidth.current !== sidebarReservedWidth
    fittedSidebarWidth.current = sidebarReservedWidth
    const pageNumber =
      openPages.find((page) => !revealedPages.current.has(page)) ??
      (sidebarWidthChanged ? openPages.at(-1) : undefined)
    if (!pageNumber || !viewport || !onViewportChange) return
    revealedPages.current.add(pageNumber)
    const frame = requestAnimationFrame(() => {
      const page = globalThis.document.querySelector<HTMLElement>(
        `.page[data-page-number="${pageNumber}"]`,
      )
      const board = globalThis.document.querySelector<HTMLElement>(".board-viewport")
      const boardWorld = globalThis.document.querySelector<HTMLElement>(".board-world")
      if (!page || !board || !boardWorld || boardWorld.offsetWidth <= 0) return
      const pageRect = page.getBoundingClientRect()
      const worldRect = boardWorld.getBoundingClientRect()
      const placement = pageTranslationWorldPlacement(pageRect, worldRect, boardWorld.offsetWidth)
      const scale = worldRect.width / boardWorld.offsetWidth
      if (!placement || !Number.isFinite(scale) || scale <= 0) return
      const pageWidth = pageRect.width / scale
      const next = fitWorldRectHorizontally(
        viewport,
        board.clientWidth - sidebarReservedWidth,
        {
          x: placement.left - pageTranslationLayout.gap - pageWidth,
          y: placement.top,
          width: pageWidth + pageTranslationLayout.gap + pageTranslationLayout.width,
        },
        16,
      )
      onViewportChange(next)
    })
    return () => cancelAnimationFrame(frame)
  }, [onViewportChange, openPages, sidebarReservedWidth, viewport])

  return world
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
        world,
      )
    : null
}
