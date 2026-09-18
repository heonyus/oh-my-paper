import { type JSX, useState } from "react"
import type {
  AccountApi,
  AccountRecoveryEntry,
  AccountRecoveryRecord,
} from "../../../shared/accountIpc"
import type { CollectionApi } from "../../../shared/collectionIpc"
import type { KnowledgeNode, KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { CreateNodeInput } from "../../../shared/knowledgeTypes"
import { CollectionStatusPanel } from "./CollectionStatusPanel"

export function RecoveryPanel({
  api,
  collection,
  createNote,
  onOpen,
}: {
  readonly api: Pick<AccountApi, "listRecoveryDrafts" | "readRecoveryDraft">
  readonly collection?: Pick<CollectionApi, "status" | "onChanged"> | undefined
  readonly createNote: (input: CreateNodeInput) => Promise<KnowledgeNode>
  readonly onOpen?: ((id: KnowledgeNodeId) => void) | undefined
}): JSX.Element {
  const [entries, setEntries] = useState<readonly AccountRecoveryEntry[] | null>(null)
  const [selected, setSelected] = useState<AccountRecoveryRecord | null>(null)
  const [restored, setRestored] = useState<KnowledgeNode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError("복구 작업을 완료하지 못했습니다. 기존 자료와 복구 사본은 변경하지 않았습니다.")
    } finally {
      setBusy(false)
    }
  }
  async function preview(entry: AccountRecoveryEntry): Promise<void> {
    setRestored(null)
    setSelected(await api.readRecoveryDraft({ recoveryId: entry.recoveryId, nodeId: entry.nodeId }))
  }
  async function restore(): Promise<void> {
    if (!selected || restored) return
    const draft = selected.draft
    setRestored(
      await createNote({
        kind: "note",
        title: `${draft.title} (복구)`,
        body: draft.body,
        aliases: draft.aliases,
        metadata: { recoveredFrom: selected.recoveryId, originalNodeId: draft.nodeId },
      }),
    )
  }
  return (
    <>
      {collection ? <CollectionStatusPanel api={collection} /> : null}
      <section className="knowledge-card" aria-labelledby="draft-recovery-title" aria-busy={busy}>
        <h3 id="draft-recovery-title">저장하지 못한 초안</h3>
        <p className="knowledge-help">
          로그아웃이나 앱 종료 때 남긴 복구 사본을 확인합니다. 기존 노트는 덮어쓰지 않습니다.
        </p>
        <button
          type="button"
          className="knowledge-btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setEntries(await api.listRecoveryDrafts({ limit: 50 }))
            })
          }
        >
          복구할 초안 확인
        </button>
        {entries?.length === 0 ? <p role="status">복구할 초안이 없습니다.</p> : null}
        {entries && entries.length > 0 ? (
          <ul className="collection-history-list">
            {entries.map((entry) => (
              <li key={entry.recoveryId}>
                <button
                  type="button"
                  className="knowledge-btn"
                  disabled={busy}
                  onClick={() => void run(() => preview(entry))}
                >
                  {entry.title} · {new Date(entry.capturedAt).toLocaleString("ko-KR")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {selected ? (
          <>
            <label htmlFor="recovery-preview">복구할 Markdown 원문</label>
            <textarea
              id="recovery-preview"
              className="collection-history-preview"
              readOnly
              value={selected.draft.body}
            />
            {restored ? (
              <p role="status">새 노트로 복구했습니다. 복구 사본도 계속 보관됩니다.</p>
            ) : (
              <button
                type="button"
                className="knowledge-btn knowledge-btn-primary"
                disabled={busy}
                onClick={() => void run(restore)}
              >
                새 노트로 복구
              </button>
            )}
            {restored && onOpen ? (
              <button type="button" className="knowledge-btn" onClick={() => onOpen(restored.id)}>
                복구한 노트 열기
              </button>
            ) : null}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="knowledge-error">
            {error}
          </p>
        ) : null}
      </section>
    </>
  )
}
