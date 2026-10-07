import { FileDown, FileText, Languages, Printer, RefreshCw, Square, Type, X } from "lucide-react"
import { type JSX, useEffect, useMemo, useRef, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import { parsedDocumentPage } from "../lib/documentPageRuntime"
import { useLocale, useTranslator } from "../lib/locale"
import {
  clearPageTranslationBlocks,
  publishPageTranslationBlocks,
} from "../lib/pageTranslationBlocksRegistry"
import { equationRegions } from "../lib/pageTranslationEquations"
import { type PageTranslationMode, usePageTranslationMode } from "../lib/pageTranslationMode"
import { nextTextSize, parserStageMessage, type TextSize } from "../lib/pageTranslationPaneState"
import { paragraphRegions } from "../lib/pageTranslationParagraphs"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { usePageSourceHover } from "../lib/usePageSourceHover"
import { usePageTranslation } from "../lib/usePageTranslation"
import { usePageTranslationPlacement } from "../lib/usePageTranslationPlacement"
import { usePdfPage } from "../lib/usePdfPage"
import { useTranslationHighlights } from "../lib/useTranslationHighlights"
import { readerMessages } from "../messages/reader"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { PageTranslationBlock } from "./PageTranslationBlock"
import { PageTranslationLayout } from "./PageTranslationLayout"
import { PageTranslationPrintDocument } from "./PageTranslationPrintDocument"

export function PageTranslationPane({
  document,
  currentPage,
  citations,
  provider,
  onAiRequest,
  onClose,
}: {
  readonly document: DocumentRecord
  readonly currentPage: number
  readonly citations: readonly CitationIndexEntry[]
  readonly provider: ProviderStatus
  readonly onAiRequest: AiRequestRunner
  readonly onClose: () => void
}): JSX.Element {
  const { locale } = useLocale()
  const t = useTranslator(readerMessages)
  const [textSize, setTextSize] = useState<TextSize>("normal")
  const [mode, setMode] = usePageTranslationMode(document.id)
  const [printPages, setPrintPages] = useState<Readonly<Record<number, string>> | null>(null)
  const placement = usePageTranslationPlacement(currentPage)
  const bodyRef = useRef<HTMLDivElement>(null)
  usePageSourceHover(currentPage, bodyRef)
  const {
    blocks,
    status,
    failure,
    progress,
    totalChunks,
    parserStage,
    regenerate,
    translateAll,
    cancelAll,
    documentProgress,
    documentStatus,
    documentError,
    documentPages,
  } = usePageTranslation({
    document,
    currentPage,
    citations,
    provider,
    onAiRequest,
  })

  // Selecting in the pane reads back to these units; the board's highlights echo on them.
  useEffect(() => {
    publishPageTranslationBlocks(currentPage, blocks)
    return () => clearPageTranslationBlocks(currentPage)
  }, [currentPage, blocks])
  useTranslationHighlights(currentPage, bodyRef, blocks)

  const visibleBlocks = useMemo(
    () =>
      mode === "parallel"
        ? blocks.filter(
            (block) => block.translation.trim().length > 0 || block.structureKind === "figure",
          )
        : blocks,
    [blocks, mode],
  )
  const source = usePdfPage(document.id, currentPage)
  const regions = useMemo(() => {
    const parsed = parsedDocumentPage(document.id, currentPage)
    return [...paragraphRegions(blocks, parsed, source.runs), ...equationRegions(blocks, parsed)]
  }, [blocks, document.id, currentPage, source.runs])
  const previousGroups = useRef<readonly (readonly (typeof blocks)[number][])[]>([])
  const bilingualGroups = useMemo(() => {
    const groups: (typeof blocks)[number][][] = []
    for (const block of visibleBlocks) {
      const previous = groups.at(-1)
      if (
        previous &&
        block.parsedBlockId !== undefined &&
        previous[0]?.parsedBlockId === block.parsedBlockId
      )
        previous.push(block)
      else groups.push([block])
    }
    // 스트리밍 델타로 blocks 배열이 바뀌어도 멤버가 동일한 그룹은 이전 배열을 재사용해
    // memo된 PageTranslationBlock이 리렌더를 건너뛸 수 있게 한다
    const shared = groups.map((group, index) => {
      const previous = previousGroups.current[index]
      return previous &&
        previous.length === group.length &&
        previous.every((block, position) => block === group[position])
        ? previous
        : group
    })
    previousGroups.current = shared
    return shared
  }, [visibleBlocks])

  function printTranslation(): void {
    globalThis.document.body.setAttribute("data-print-translation", "current")
    for (const pane of globalThis.document.querySelectorAll<HTMLElement>(
      ".page-translation-pane",
    )) {
      pane.setAttribute(
        "data-print-hidden",
        pane.getAttribute("data-page-number") !== String(currentPage) ? "true" : "false",
      )
    }
    globalThis.addEventListener(
      "afterprint",
      () => {
        globalThis.document.body.removeAttribute("data-print-translation")
        for (const pane of globalThis.document.querySelectorAll<HTMLElement>(
          ".page-translation-pane",
        ))
          pane.removeAttribute("data-print-hidden")
      },
      { once: true },
    )
    globalThis.print()
  }

  function printDocumentTranslation(): void {
    if (documentStatus !== "complete" || Object.keys(documentPages).length !== document.pageCount)
      return
    const images: Record<number, string> = {}
    for (let page = 1; page <= document.pageCount; page += 1) {
      const canvas = globalThis.document.querySelector<HTMLCanvasElement>(
        `.page[data-page-number="${page}"] canvas`,
      )
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        images[page] = canvas.toDataURL("image/png")
      }
    }
    setPrintPages(images)
  }

  useEffect(() => {
    if (!printPages) return
    const body = globalThis.document.body
    body.setAttribute("data-print-translation", "document")
    const finish = (): void => {
      body.removeAttribute("data-print-translation")
      setPrintPages(null)
    }
    globalThis.addEventListener("afterprint", finish, { once: true })
    const frame = globalThis.requestAnimationFrame(() => globalThis.print())
    return () => {
      globalThis.cancelAnimationFrame(frame)
      globalThis.removeEventListener("afterprint", finish)
      body.removeAttribute("data-print-translation")
    }
  }, [printPages])

  const modes: readonly { readonly id: PageTranslationMode; readonly label: string }[] = [
    { id: "layout", label: t("translation.mode.layout") },
    { id: "source", label: t("translation.mode.source") },
    { id: "parallel", label: t("translation.mode.parallel") },
    { id: "bilingual", label: t("translation.mode.bilingual") },
  ]

  return (
    <>
      <section
        className="page-translation-pane"
        aria-label={t("translation.title")}
        data-size={textSize}
        data-mode={mode}
        data-page-number={currentPage}
        data-positioned={placement !== null}
        style={
          placement
            ? {
                left: placement.left,
                top: placement.top,
                width: mode === "layout" ? placement.pageWidth : placement.width,
                height: placement.height,
              }
            : undefined
        }
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="page-translation-head">
          <div className="page-translation-title">
            <Languages size={17} />
            <span>{t("translation.title")}</span>
          </div>
          <span className="page-translation-count">
            p. {currentPage} / {document.pageCount}
          </span>
          <div
            className="page-translation-modes"
            role="tablist"
            aria-label={t("translation.modes")}
          >
            {modes.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={mode === candidate.id}
                data-active={mode === candidate.id}
                onClick={() => setMode(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <div className="page-translation-actions">
            <button
              type="button"
              aria-label={t("translation.translateAll")}
              disabled={
                documentStatus === "running" ||
                status === "parser-running" ||
                status === "streaming" ||
                !provider.configured
              }
              onClick={() => void translateAll()}
            >
              <FileText size={16} />
            </button>
            {documentStatus === "running" ? (
              <button type="button" aria-label={t("translation.cancelAll")} onClick={cancelAll}>
                <Square size={15} />
              </button>
            ) : null}
            <button type="button" aria-label={t("translation.print")} onClick={printTranslation}>
              <Printer size={16} />
            </button>
            <button
              type="button"
              aria-label={t("translation.savePdf")}
              disabled={
                documentStatus !== "complete" ||
                Object.keys(documentPages).length !== document.pageCount
              }
              onClick={printDocumentTranslation}
            >
              <FileDown size={16} />
            </button>
            <button
              type="button"
              aria-label={t("translation.retranslate")}
              onClick={() => void regenerate()}
            >
              <RefreshCw size={17} />
            </button>
            <button
              type="button"
              aria-label={t("translation.textSize")}
              onClick={() => setTextSize((value) => nextTextSize(value))}
            >
              <Type size={17} />
            </button>
            <button type="button" aria-label={t("translation.close")} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>
        <div ref={bodyRef} className="page-translation-body">
          <div className="page-translation-notices">
            {documentStatus === "running" && documentProgress ? (
              <p className="page-translation-document-progress" role="status">
                {t("translation.documentProgress", {
                  completed: documentProgress.completedPages,
                  total: documentProgress.pageCount,
                  page: documentProgress.page,
                })}
              </p>
            ) : null}
            {documentStatus === "complete" ? (
              <p className="page-translation-document-progress" role="status">
                {t("translation.documentComplete")}
              </p>
            ) : null}
            {documentStatus === "cancelled" ? (
              <p className="page-translation-document-progress" role="status">
                {t("translation.documentCancelled")}
              </p>
            ) : null}
            {documentStatus === "failed" ? (
              <div className="page-translation-document-progress" role="alert">
                <p>{t("translation.documentFailed")}</p>
                {documentError ? <code>{documentError}</code> : null}
              </div>
            ) : null}
            {status === "waiting" ? (
              <div className="page-translation-state" role="status">
                <span className="page-translation-progress" />
                <p>{t("translation.waiting")}</p>
              </div>
            ) : null}
            {status === "parser-running" ? (
              <div className="page-translation-state" role="status">
                <span className="page-translation-progress" />
                <p>{parserStageMessage(parserStage, locale)}</p>
              </div>
            ) : null}
            {status === "streaming" ? (
              <p className="page-translation-stream" role="status">
                {t("translation.streaming", { progress, total: totalChunks })}
              </p>
            ) : null}
            {status === "setup" ? (
              <p className="page-translation-message">{t("translation.setup")}</p>
            ) : null}
            {status === "parser-unavailable" ? (
              <div className="page-translation-message" role="alert">
                <p>{t("translation.parserUnavailable")}</p>
                <button type="button" onClick={() => void regenerate()}>
                  {t("translation.retry")}
                </button>
              </div>
            ) : null}
            {status === "failed" ? (
              <div className="page-translation-message" role="alert">
                <p>{t("translation.failed")}</p>
                {failure ? <p>{failure}</p> : null}
                <button type="button" onClick={() => void regenerate()}>
                  {t("translation.retry")}
                </button>
              </div>
            ) : null}
          </div>
          {mode === "layout" ? (
            <PageTranslationLayout
              documentId={document.id}
              page={currentPage}
              pdfPage={source.page}
              regions={regions}
            />
          ) : null}
          {mode === "layout"
            ? null
            : (mode === "bilingual" ? bilingualGroups : visibleBlocks.map((block) => [block])).map(
                (group, index) => {
                  const block = group[0]
                  if (!block) return null
                  return (
                    <PageTranslationBlock
                      key={block.id}
                      block={block}
                      page={currentPage}
                      mode={mode}
                      group={mode === "bilingual" ? group : undefined}
                      startsGroup={
                        index === 0 ||
                        block.parsedBlockId === undefined ||
                        block.parsedBlockId !==
                          (mode === "bilingual"
                            ? bilingualGroups[index - 1]?.[0]
                            : visibleBlocks[index - 1]
                          )?.parsedBlockId
                      }
                    />
                  )
                },
              )}
        </div>
      </section>
      {printPages ? (
        <PageTranslationPrintDocument
          documentTitle={document.title}
          mode={mode}
          pages={documentPages}
          pageImages={printPages}
        />
      ) : null}
    </>
  )
}
