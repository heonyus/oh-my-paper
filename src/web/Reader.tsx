import "./reader.css"
import { ChevronLeft, ChevronRight, Languages, RefreshCw } from "lucide-react"
import { type JSX, useCallback, useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkMath from "remark-math"
import {
  documentFileUrl,
  translateDocumentPage,
  type WebDocument,
  type WebPageTranslation,
} from "./api"
import { PdfPage } from "./PdfPage"

export function Reader({
  document,
  onRefresh,
}: {
  readonly document: WebDocument
  readonly onRefresh: () => Promise<void>
}): JSX.Element {
  const [page, setPage] = useState(1)
  const [pdfPages, setPdfPages] = useState(document.pageCount || 1)
  const [translation, setTranslation] = useState<WebPageTranslation | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle")
  const [activeId, setActiveId] = useState<string | null>(null)
  const setPageCount = useCallback((count: number) => setPdfPages(count), [])

  useEffect(() => {
    if (document.status === "queued" || document.status === "analyzing") {
      const timer = window.setInterval(() => void onRefresh(), 2_000)
      return () => window.clearInterval(timer)
    }
  }, [document.status, onRefresh])

  const changePage = (next: number): void => {
    setPage(next)
    setTranslation(null)
    setStatus("idle")
    setActiveId(null)
  }

  const translate = async (regenerate = false): Promise<void> => {
    setStatus("loading")
    try {
      setTranslation(await translateDocumentPage(document.id, page, regenerate))
      setStatus("idle")
    } catch {
      setStatus("failed")
    }
  }
  const active = translation?.items.find((item) => item.id === activeId) ?? null
  const sourceSize = translation
    ? { width: translation.pageWidth, height: translation.pageHeight }
    : null

  return (
    <section className="reader">
      <div className="reader-toolbar">
        <button
          type="button"
          className="icon-button"
          disabled={page <= 1}
          onClick={() => changePage(Math.max(1, page - 1))}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {page} / {pdfPages}
        </span>
        <button
          type="button"
          className="icon-button"
          disabled={page >= pdfPages}
          onClick={() => changePage(Math.min(pdfPages, page + 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="reader-columns">
        <PdfPage
          url={documentFileUrl(document.id)}
          pageNumber={page}
          activeBounds={active?.bounds ?? null}
          sourceSize={sourceSize}
          onPageCount={setPageCount}
        />
        <aside className="translation-pane">
          <header>
            <div>
              <Languages size={17} />
              <strong>페이지 번역</strong>
            </div>
            <span>
              p. {page} / {pdfPages}
            </span>
            {translation ? (
              <button
                type="button"
                className="icon-button"
                aria-label="다시 번역"
                onClick={() => void translate(true)}
              >
                <RefreshCw size={16} />
              </button>
            ) : null}
          </header>
          {document.status === "queued" || document.status === "analyzing" ? (
            <div className="translation-state">
              <i />
              <p>
                {document.status === "queued"
                  ? "구조 분석을 기다리고 있습니다."
                  : "PaddleOCR-VL이 문장과 수식 위치를 분석하고 있습니다."}
              </p>
            </div>
          ) : null}
          {document.status === "failed" ? (
            <div className="translation-state error">
              <p>문서 구조를 준비하지 못했습니다. 라이브러리에서 다시 업로드해주세요.</p>
            </div>
          ) : null}
          {document.status === "ready" && !translation && status === "idle" ? (
            <div className="translation-empty">
              <p>표와 그림은 제외하고, 본문 문장과 수식만 현재 페이지에 맞춰 번역합니다.</p>
              <button type="button" className="primary-button" onClick={() => void translate()}>
                <Languages size={16} /> 이 페이지 번역
              </button>
            </div>
          ) : null}
          {status === "loading" ? (
            <div className="translation-state">
              <i />
              <p>Gemini가 문장 순서를 유지하며 번역하고 있습니다.</p>
            </div>
          ) : null}
          {status === "failed" ? (
            <div className="translation-state error">
              <p>번역을 완료하지 못했습니다.</p>
              <button type="button" className="text-button" onClick={() => void translate()}>
                다시 시도
              </button>
            </div>
          ) : null}
          {translation ? (
            <div className="translation-body">
              {translation.cached ? <p className="cache-label">저장된 번역</p> : null}
              {translation.items.map((item) => (
                <article
                  key={item.id}
                  data-kind={item.kind}
                  onMouseEnter={() => setActiveId(item.id)}
                  onMouseLeave={() => setActiveId(null)}
                >
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {item.translation}
                  </ReactMarkdown>
                </article>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
