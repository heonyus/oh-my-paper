import { Languages, RefreshCw, Type, X } from "lucide-react"
import { type JSX, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import { nextTextSize, parserStageMessage, type TextSize } from "../lib/pageTranslationPaneState"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { usePageTranslation } from "../lib/usePageTranslation"
import { usePageTranslationPlacement } from "../lib/usePageTranslationPlacement"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { PageTranslationBlock } from "./PageTranslationBlock"

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
  const placement = usePageTranslationPlacement(currentPage)
  const { blocks, status, progress, totalChunks, parserStage, regenerate } = usePageTranslation({
    document,
    currentPage,
    citations,
    provider,
    onAiRequest,
  })

  const visibleBlocks = blocks.filter((block) => block.translation.trim())

  return (
    <section
      className="page-translation-pane"
      aria-label="페이지 번역"
      data-size={textSize}
      data-positioned={placement !== null}
      style={placement ?? undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="page-translation-head">
        <div className="page-translation-title">
          <Languages size={17} />
          <span>페이지 번역</span>
        </div>
        <span className="page-translation-count">
          p. {currentPage} / {document.pageCount}
        </span>
        <div className="page-translation-actions">
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
      <div className="page-translation-body">
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
        {visibleBlocks.map((block, index) => (
          <PageTranslationBlock
            key={block.id}
            block={block}
            page={currentPage}
            startsGroup={
              index === 0 || block.parsedBlockId !== visibleBlocks[index - 1]?.parsedBlockId
            }
          />
        ))}
      </div>
    </section>
  )
}
