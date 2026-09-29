import { FileDown, FileText, Languages, Printer, RefreshCw, Square, Type, X } from "lucide-react"
import { type JSX, useEffect, useMemo, useRef, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import { parsedDocumentPage } from "../lib/documentPageRuntime"
import { type PageTranslationMode, usePageTranslationMode } from "../lib/pageTranslationMode"
import { nextTextSize, parserStageMessage, type TextSize } from "../lib/pageTranslationPaneState"
import { paragraphRegions } from "../lib/pageTranslationParagraphs"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { usePageSourceHover } from "../lib/usePageSourceHover"
import { usePageTranslation } from "../lib/usePageTranslation"
import { usePageTranslationPlacement } from "../lib/usePageTranslationPlacement"
import { usePdfPage } from "../lib/usePdfPage"
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
  const [textSize, setTextSize] = useState<TextSize>("normal")
  const [mode, setMode] = usePageTranslationMode(document.id)
  const [printPages, setPrintPages] = useState<Readonly<Record<number, string>> | null>(null)
  const placement = usePageTranslationPlacement(currentPage)
  const bodyRef = useRef<HTMLDivElement>(null)
  usePageSourceHover(currentPage, bodyRef)
  const {
    blocks,
    status,
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
  const regions = useMemo(
    () => paragraphRegions(blocks, parsedDocumentPage(document.id, currentPage), source.runs),
    [blocks, document.id, currentPage, source.runs],
  )
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
    { id: "layout", label: "원본 배치" },
    { id: "source", label: "원문" },
    { id: "parallel", label: "대조" },
    { id: "bilingual", label: "함께 읽기" },
  ]

  return (
    <>
      <section
        className="page-translation-pane"
        aria-label="페이지 번역"
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
            <span>페이지 번역</span>
          </div>
          <span className="page-translation-count">
            p. {currentPage} / {document.pageCount}
          </span>
          <div className="page-translation-modes" role="tablist" aria-label="번역 읽기 모드">
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
              aria-label="전체 문서 번역 시작"
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
              <button type="button" aria-label="전체 문서 번역 취소" onClick={cancelAll}>
                <Square size={15} />
              </button>
            ) : null}
            <button type="button" aria-label="현재 번역 인쇄" onClick={printTranslation}>
              <Printer size={16} />
            </button>
            <button
              type="button"
              aria-label="전체 번역 PDF 저장"
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
              aria-label="현재 페이지 다시 번역"
              onClick={() => void regenerate()}
            >
              <RefreshCw size={17} />
            </button>
            <button
              type="button"
              aria-label="번역 글자 크기 변경"
              onClick={() => setTextSize((value) => nextTextSize(value))}
            >
              <Type size={17} />
            </button>
            <button type="button" aria-label="페이지 번역 닫기" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>
        <div ref={bodyRef} className="page-translation-body">
          <div className="page-translation-notices">
            {documentStatus === "running" && documentProgress ? (
              <p className="page-translation-document-progress" role="status">
                전체 문서 번역 · {documentProgress.completedPages}/{documentProgress.pageCount}
                페이지 · p. {documentProgress.page}
              </p>
            ) : null}
            {documentStatus === "complete" ? (
              <p className="page-translation-document-progress" role="status">
                전체 문서 번역이 완료되었습니다. 저장된 페이지는 다시 요청하지 않습니다.
              </p>
            ) : null}
            {documentStatus === "cancelled" ? (
              <p className="page-translation-document-progress" role="status">
                전체 문서 번역을 중단했습니다. 완료된 페이지는 저장되어 다시 이어갈 수 있습니다.
              </p>
            ) : null}
            {documentStatus === "failed" ? (
              <div className="page-translation-document-progress" role="alert">
                <p>전체 문서 번역 중 문제가 발생했습니다. 저장된 페이지는 유지됩니다.</p>
                {documentError ? <code>{documentError}</code> : null}
              </div>
            ) : null}
            {status === "waiting" ? (
              <div className="page-translation-state" role="status">
                <span className="page-translation-progress" />
                <p>현재 페이지의 본문을 준비하고 있습니다.</p>
              </div>
            ) : null}
            {status === "parser-running" ? (
              <div className="page-translation-state" role="status">
                <span className="page-translation-progress" />
                <p>{parserStageMessage(parserStage)}</p>
              </div>
            ) : null}
            {status === "streaming" ? (
              <p className="page-translation-stream" role="status">
                번역하는 중 · {progress}/{totalChunks}
              </p>
            ) : null}
            {status === "setup" ? (
              <p className="page-translation-message">AI 설정을 완료하면 이 페이지를 번역합니다.</p>
            ) : null}
            {status === "parser-unavailable" ? (
              <div className="page-translation-message" role="alert">
                <p>현재 페이지의 구조를 준비하지 못했습니다.</p>
                <button type="button" onClick={() => void regenerate()}>
                  다시 시도
                </button>
              </div>
            ) : null}
            {status === "failed" ? (
              <div className="page-translation-message" role="alert">
                <p>페이지 번역을 완료하지 못했습니다.</p>
                <button type="button" onClick={() => void regenerate()}>
                  다시 시도
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
