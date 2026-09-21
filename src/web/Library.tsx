import { FilePlus2, FileText, Search, UploadCloud } from "lucide-react"
import { type ChangeEvent, type DragEvent, type JSX, useMemo, useRef, useState } from "react"
import { uploadPdf, type WebDocument } from "./api"
import { inspectLocalPdf, type LocalPdf } from "./localPdf"

function statusText(document: WebDocument): string {
  if (document.status === "queued") return "분석 대기 중"
  if (document.status === "analyzing") return "로컬 문서 구조 분석 중"
  if (document.status === "failed") return "분석 실패 · 다시 업로드"
  return `${document.pageCount}페이지 · 준비 완료`
}

async function inspectFiles(files: readonly File[]): Promise<readonly LocalPdf[]> {
  return Promise.all(
    files.map(async (file) => {
      try {
        return await inspectLocalPdf(file)
      } catch (error) {
        return {
          id: crypto.randomUUID(),
          file,
          pageCount: 0,
          status: "failed" as const,
          error: error instanceof Error ? error.message : "PDF를 확인하지 못했습니다.",
        }
      }
    }),
  )
}

export function Library({
  documents,
  loading,
  error,
  onOpen,
  onRefresh,
}: {
  readonly documents: readonly WebDocument[]
  readonly loading: boolean
  readonly error: string | null
  readonly onOpen: (id: string) => void
  readonly onRefresh: () => Promise<void>
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [local, setLocal] = useState<readonly LocalPdf[]>([])
  const [dragging, setDragging] = useState(false)
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return documents.filter(
      (document) => !needle || document.name.toLocaleLowerCase().includes(needle),
    )
  }, [documents, query])
  const activeJobs = documents.filter(
    (document) => document.status === "queued" || document.status === "analyzing",
  )

  const addFiles = async (files: readonly File[]): Promise<void> => {
    const inspected = await inspectFiles(files.filter((file) => file.type === "application/pdf"))
    setLocal((current) => [...current, ...inspected])
  }
  const upload = async (item: LocalPdf): Promise<void> => {
    setLocal((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, status: "uploading" } : candidate,
      ),
    )
    try {
      await uploadPdf(item.file)
      setLocal((current) => current.filter((candidate) => candidate.id !== item.id))
      await onRefresh()
    } catch {
      setLocal((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: "failed", error: "업로드하지 못했습니다." }
            : candidate,
        ),
      )
    }
  }
  const inputChanged = (event: ChangeEvent<HTMLInputElement>): void => {
    void addFiles(Array.from(event.target.files ?? []))
    event.target.value = ""
  }
  const dropped = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
    setDragging(false)
    void addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <section
      className="library"
      data-dragging={dragging}
      aria-label="PDF 라이브러리"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={dropped}
    >
      <div className="library-inner">
        <header className="library-heading">
          <p className="eyebrow">PRIVATE PAPER LIBRARY</p>
          <h1>읽을 논문</h1>
          <p>파일 선택은 로컬 확인만 수행합니다. 업로드·분석은 다음 단계에서 시작됩니다.</p>
        </header>
        <div className="library-actions">
          <label className="search-field">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="논문 검색"
            />
          </label>
          <button type="button" className="secondary-button" onClick={() => input.current?.click()}>
            <FilePlus2 size={17} /> PDF 선택
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={inputChanged}
          />
        </div>

        {local.length > 0 ? (
          <section className="local-tray" aria-label="로컬에서 준비한 PDF">
            <div className="tray-heading">
              <div>
                <strong>업로드 전 확인</strong>
                <span className="tray-count">{local.length}개</span>
              </div>
              <button
                type="button"
                className="text-button"
                disabled={!local.some((item) => item.status === "ready")}
                onClick={() =>
                  void Promise.all(local.filter((item) => item.status === "ready").map(upload))
                }
              >
                준비된 파일 모두 업로드·분석
              </button>
            </div>
            {local.map((item) => (
              <div className="local-row" key={item.id}>
                <FileText size={20} />
                <div>
                  <strong>{item.file.name}</strong>
                  <span className="local-meta">
                    {item.error ?? `${item.pageCount}페이지 · 로컬 확인 완료`}
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-button compact"
                  disabled={item.status !== "ready"}
                  onClick={() => void upload(item)}
                >
                  <UploadCloud size={15} />{" "}
                  {item.status === "uploading" ? "업로드 중" : "업로드·분석"}
                </button>
              </div>
            ))}
          </section>
        ) : null}

        {error ? <p className="inline-error">{error}</p> : null}
        {loading ? <p className="quiet-state">라이브러리를 불러오는 중…</p> : null}
        {!loading && visible.length === 0 ? (
          <div className="empty-library">
            <FileText size={28} />
            <h2>{query ? "검색 결과가 없습니다" : "첫 논문을 준비해보세요"}</h2>
            <p>PDF를 놓거나 위의 PDF 선택을 누르세요.</p>
          </div>
        ) : (
          <div className="document-grid">
            {visible.map((document) => (
              <button
                type="button"
                className="document-card"
                key={document.id}
                onClick={() => onOpen(document.id)}
              >
                <span className="paper-preview">
                  <FileText size={30} />
                </span>
                <strong>{document.name}</strong>
                <span data-status={document.status}>{statusText(document)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {activeJobs.length > 0 ? (
        <aside className="task-queue" aria-label="문서 분석 진행 상황">
          <strong>문서 준비 중</strong>
          {activeJobs.map((document) => (
            <div key={document.id}>
              <span className="task-name">{document.name}</span>
              <i />
            </div>
          ))}
        </aside>
      ) : null}
    </section>
  )
}
