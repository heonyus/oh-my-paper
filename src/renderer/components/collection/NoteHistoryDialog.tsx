import { type JSX, useEffect, useRef, useState } from "react"
import type { CollectionApi } from "../../../shared/collectionIpc"
import { NoteConflictReview } from "./NoteConflictReview"
import "./collection-history.css"

export function NoteHistoryDialog({
  api,
  noteId,
  onClose,
  onRestored,
}: {
  readonly api: CollectionApi
  readonly noteId: string
  readonly onClose: () => void
  readonly onRestored: () => void
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<CollectionApi["history"]>> | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(50)
  const [conflict, setConflict] = useState<string | null>(null)
  useEffect(() => {
    dialog.current?.showModal()
    let active = true
    void api
      .history(noteId)
      .then((value) => {
        if (active) setHistory(value)
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "변경 이력을 열지 못했습니다.")
      })
    return () => {
      active = false
    }
  }, [api, noteId])
  async function preview(snapshotId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const entry = history?.snapshots.find((item) => item.snapshotId === snapshotId)
      if (!entry) return
      const result = await api.preview({ noteId: entry.noteId, snapshotId })
      setBody(result)
      setSelected(snapshotId)
      setConflict(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이력을 읽지 못했습니다.")
    } finally {
      setBusy(false)
    }
  }
  async function restore(): Promise<void> {
    if (!history || !selected) return
    setBusy(true)
    setError(null)
    try {
      await api.restore({
        noteId: history.noteId,
        snapshotId: selected,
        expectedRevision: history.currentRevision,
      })
      onRestored()
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "복원하지 못했습니다. 현재 파일은 보존됩니다.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="collection-history-modal"
      aria-labelledby="note-history-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header className="settings-content-head">
        <h2 id="note-history-title">변경 이력</h2>
        <button
          type="button"
          className="knowledge-btn"
          disabled={busy}
          onClick={onClose}
          aria-label="변경 이력 닫기"
        >
          닫기
        </button>
      </header>
      <div className="collection-history-body">
        {error ? (
          <p role="alert" className="knowledge-error">
            {error}
          </p>
        ) : null}
        {!history && !error ? <p role="status">이력을 읽는 중…</p> : null}
        <p className="knowledge-help">
          최근 30일의 변경 내용을 확인합니다. 복원 전의 내용도 이력에 남습니다.
        </p>
        {history ? (
          <ul className="collection-history-list">
            {history.conflicts.map((item) => (
              <li key={item.conflictId}>
                <button
                  type="button"
                  className="knowledge-btn"
                  disabled={busy}
                  onClick={() => {
                    setConflict(item.conflictId)
                    setSelected(null)
                  }}
                >
                  충돌 확인 · {new Date(item.createdAt).toLocaleString()}
                </button>
              </li>
            ))}
            {history.snapshots.slice(0, limit).map((entry) => (
              <li key={entry.snapshotId}>
                <button
                  type="button"
                  className="knowledge-btn"
                  aria-pressed={selected === entry.snapshotId}
                  disabled={busy}
                  onClick={() => void preview(entry.snapshotId)}
                >
                  {new Date(entry.createdAt).toLocaleString()} ·{" "}
                  {entry.reason === "external_change"
                    ? "외부 수정 전"
                    : entry.reason === "restore"
                      ? "복원 전"
                      : "저장본"}
                </button>
              </li>
            ))}
            {history.snapshots.length === 0 ? <li>아직 이전 저장본이 없습니다.</li> : null}
          </ul>
        ) : null}
        {history && history.snapshots.length > limit ? (
          <button type="button" className="knowledge-btn" onClick={() => setLimit(limit + 50)}>
            이전 이력 더 보기
          </button>
        ) : null}
        {selected ? (
          <>
            <textarea
              className="collection-history-preview"
              readOnly
              value={body}
              aria-label="이전 저장본 미리보기"
            />
            <button
              type="button"
              className="knowledge-btn knowledge-btn-primary"
              disabled={busy}
              onClick={() => void restore()}
            >
              이 내용으로 복원
            </button>
          </>
        ) : null}
        {conflict ? (
          <NoteConflictReview
            key={conflict}
            api={api}
            conflictId={conflict}
            onResolved={() => {
              onRestored()
              onClose()
            }}
          />
        ) : null}
      </div>
    </dialog>
  )
}
