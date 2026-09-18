import type { FormEvent, JSX } from "react"
import { useCallback, useEffect, useState } from "react"
import type { MemoryPreloadApi } from "../../../shared/memoryIpc"
import type {
  MemoryCreateResult,
  MemoryId,
  MemoryNavigationRecent,
  MemoryPage,
} from "../../../shared/memorySchemas"
import { MemoryInspector } from "./MemoryInspector"
import "../knowledge/knowledge.css"
import "./memory.css"

export interface MemoryViewProps {
  readonly api: MemoryPreloadApi
  readonly projectName?: string
  readonly pageSize?: number
}

export function MemoryView({ api, projectName, pageSize = 20 }: MemoryViewProps): JSX.Element {
  const [page, setPage] = useState<MemoryPage | null>(null)
  const [navigationRecents, setNavigationRecents] = useState<readonly MemoryNavigationRecent[]>([])
  const [pendingActionId, setPendingActionId] = useState<MemoryId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [manualDerivationKey, setManualDerivationKey] = useState(createManualDerivationKey)

  const loadPage = useCallback(
    async (pageNumber: number) => {
      setBusy(true)
      setError(null)
      try {
        const [nextPage, nextRecents] = await Promise.all([
          api.list({ page: pageNumber, pageSize }),
          api.navigationRecents(),
        ])
        setPage(nextPage)
        setNavigationRecents(nextRecents)
      } catch (caught) {
        setError(memoryErrorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [api, pageSize],
  )

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  const reviewAction = useCallback(
    async (id: MemoryId, action: (memoryId: MemoryId) => Promise<unknown>): Promise<void> => {
      setPendingActionId(id)
      setError(null)
      try {
        await action(id)
        await loadPage(page?.page ?? 0)
      } catch (caught) {
        setError(memoryErrorMessage(caught))
      } finally {
        setPendingActionId(null)
      }
    },
    [loadPage, page?.page],
  )

  const propose = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const result = await api.propose({
        derivationKey: manualDerivationKey,
        text: text.trim(),
        revision: 1,
      })
      setNotice(proposalNotice(result))
      if (result.kind === "created") {
        setManualDerivationKey(createManualDerivationKey())
        setText("")
      }
      await loadPage(page?.page ?? 0)
    } catch (caught) {
      setError(memoryErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="memory-view" aria-busy={busy}>
      <section
        className="knowledge-card memory-view-propose"
        aria-labelledby="memory-propose-heading"
      >
        <div className="memory-view-heading">
          <div>
            <h2 id="memory-propose-heading" className="knowledge-detail-title">
              새 기억 남기기
            </h2>
            <p className="knowledge-help">
              {collectionLabel(projectName)}에 기억할 내용을 적습니다. 저장 후 확인을 거쳐 검색에
              사용됩니다.
            </p>
          </div>
          <span className="knowledge-badge">직접 작성</span>
        </div>
        <form className="memory-view-form" onSubmit={(event) => void propose(event)}>
          <label htmlFor="memory-text">기억할 내용</label>
          <textarea
            id="memory-text"
            className="knowledge-input memory-view-textarea"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            maxLength={12_000}
            rows={4}
            required
            disabled={busy}
          />
          <button type="submit" className="knowledge-btn knowledge-btn-primary" disabled={busy}>
            {busy ? "저장 중…" : "기억 저장"}
          </button>
        </form>
        {notice ? (
          <p className="knowledge-help" role="status">
            {notice}
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="knowledge-error" role="alert">
          {error}
        </p>
      ) : null}
      {page ? (
        <MemoryInspector
          page={page}
          navigationRecents={navigationRecents}
          projectName={projectName}
          pendingActionId={pendingActionId}
          onPageChange={(nextPage) => void loadPage(nextPage)}
          onApprove={(id) => reviewAction(id, api.approve)}
          onReject={(id) => reviewAction(id, api.reject)}
          onForget={(id) => reviewAction(id, api.forget)}
        />
      ) : (
        <p className="knowledge-card memory-view-status" role="status">
          {busy ? "메모리를 불러오는 중…" : "메모리를 표시할 수 없습니다."}
        </p>
      )}
    </div>
  )
}

function proposalNotice(result: MemoryCreateResult): string {
  switch (result.kind) {
    case "created":
      return "기억을 저장했습니다. 확인 후 승인되면 검색에 사용됩니다."
    case "suppressed":
      return "이전에 잊은 내용이라 다시 자동 저장하지 않았습니다."
    default:
      return assertNever(result)
  }
}

function createManualDerivationKey(): string {
  return globalThis.crypto.randomUUID()
}

function collectionLabel(projectName: string | undefined): string {
  const trimmed = projectName?.trim()
  return trimmed ? `이 컬렉션 · ${trimmed}` : "이 컬렉션"
}

function memoryErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return "메모리 작업에 실패했습니다."
}

function assertNever(value: never): never {
  throw new Error(`Unexpected memory result: ${String(value)}`)
}
