import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import type { CollectionApi } from "../../../shared/collectionIpc"

type CollectionStatus = Awaited<ReturnType<CollectionApi["status"]>>
type CollectionStatusApi = Pick<CollectionApi, "status" | "onChanged">

function degradedMessage(status: CollectionStatus): string {
  if (status.error?.includes("note_count")) {
    return "노트 파일 수가 스캔 한도인 4,096개를 초과했습니다. 노트 파일 수를 4,096개 이하로 줄인 뒤 다시 확인하세요. 기존 색인 내용은 유지됩니다."
  }
  if (status.error?.includes("per_note_bytes")) {
    return "노트 파일 크기가 개별 한도인 4MiB를 초과했습니다. 큰 노트를 파일당 4MiB 이하로 줄이거나 나눈 뒤 저장하고 다시 확인하세요. 기존 색인 내용은 유지됩니다."
  }
  if (status.error?.includes("aggregate_bytes")) {
    return "노트 파일의 전체 크기가 스캔 한도인 64MiB를 초과했습니다. 전체 크기를 64MiB 이하로 줄인 뒤 다시 확인하세요. 파일을 나누기만 해서는 전체 크기가 줄지 않습니다. 기존 색인 내용은 유지됩니다."
  }
  if (status.missingNoteIds.length > 0) {
    return `원본을 확인하지 못한 노트가 ${status.missingNoteIds.length}개 있습니다. 원본 파일의 위치를 확인하거나 복구하세요.`
  }
  if (status.unresolvedConflictIds.length > 0) {
    return `해결하지 않은 노트 충돌이 ${status.unresolvedConflictIds.length}개 있습니다. 충돌을 확인한 뒤 다시 확인하세요. 기존 색인 내용은 유지됩니다.`
  }
  return "컬렉션을 완전히 확인하지 못했습니다. 기존 색인 내용은 유지됩니다. 다시 확인해 주세요."
}

export function CollectionStatusPanel({
  api,
}: {
  readonly api: CollectionStatusApi
}): JSX.Element | null {
  const [status, setStatus] = useState<CollectionStatus | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestGeneration = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++requestGeneration.current
    setLoading(true)
    try {
      const nextStatus = await api.status()
      if (request !== requestGeneration.current) return
      setStatus(nextStatus)
      setRefreshError(null)
    } catch {
      if (request !== requestGeneration.current) return
      setRefreshError(
        "최신 컬렉션 상태를 확인하지 못했습니다. 표시 중인 기존 색인 상태는 유지됩니다.",
      )
    } finally {
      if (request === requestGeneration.current) setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
    const unsubscribe = api.onChanged(() => void refresh())
    return () => {
      requestGeneration.current += 1
      unsubscribe()
    }
  }, [api, refresh])

  if (!status && !refreshError) return null
  if (status?.state === "ready" && !refreshError) return null

  return (
    <section className="knowledge-card" aria-label="컬렉션 상태" aria-busy={loading}>
      <h3>컬렉션 상태</h3>
      {refreshError ? <p role="alert">{refreshError}</p> : null}
      {status?.state === "degraded" ? (
        <p role={refreshError ? "status" : "alert"}>{degradedMessage(status)}</p>
      ) : null}
      <button
        type="button"
        className="knowledge-btn"
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? "확인 중…" : "다시 확인"}
      </button>
    </section>
  )
}
