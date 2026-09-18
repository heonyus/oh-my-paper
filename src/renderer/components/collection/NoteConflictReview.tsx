import { type JSX, useEffect, useState } from "react"
import type { CollectionApi } from "../../../shared/collectionIpc"

export function NoteConflictReview({
  api,
  conflictId,
  onResolved,
}: {
  readonly api: CollectionApi
  readonly conflictId: string
  readonly onResolved: () => void
}): JSX.Element {
  const [conflict, setConflict] = useState<Awaited<ReturnType<CollectionApi["conflict"]>> | null>(
    null,
  )
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api
      .conflict(conflictId)
      .then((value) => {
        if (!active) return
        setConflict(value)
        setBody(value.currentBody ?? "")
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "충돌 기록을 읽지 못했습니다.")
      })
    return () => {
      active = false
    }
  }, [api, conflictId])
  async function save(): Promise<void> {
    if (!conflict) return
    setBusy(true)
    setError(null)
    try {
      await api.resolveConflict({ conflictId, body, expectedRevision: conflict.currentRevision })
      onResolved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "충돌을 해결하지 못했습니다.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="충돌 검토">
      <h3>저장할 내용을 직접 확인해 주세요</h3>
      {error ? (
        <p role="alert" className="knowledge-error">
          {error}
        </p>
      ) : null}
      {conflict ? (
        <>
          <details>
            <summary>앱에서 저장하려던 내용</summary>
            <pre className="collection-conflict-source">{conflict.incomingBody}</pre>
          </details>
          <details>
            <summary>현재 파일 내용</summary>
            <pre className="collection-conflict-source">{conflict.currentBody}</pre>
          </details>
          <div className="knowledge-actions">
            <button
              type="button"
              className="knowledge-btn"
              disabled={busy}
              onClick={() => setBody(conflict.currentBody ?? "")}
            >
              현재 파일 내용 사용
            </button>
            <button
              type="button"
              className="knowledge-btn"
              disabled={busy}
              onClick={() => setBody(conflict.incomingBody)}
            >
              앱에서 작성한 내용 사용
            </button>
          </div>
          <textarea
            className="collection-history-preview"
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
            aria-label="충돌 해결 내용"
          />
          <button
            type="button"
            className="knowledge-btn knowledge-btn-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            확인한 내용 저장
          </button>
        </>
      ) : (
        <p role="status">충돌 내용을 읽는 중…</p>
      )}
    </section>
  )
}
