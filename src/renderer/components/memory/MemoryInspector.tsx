import { Ban, Check, Clock3, MapPin, Trash2 } from "lucide-react"
import type { JSX } from "react"
import {
  type MemoryId,
  type MemoryNavigationRecent,
  type MemoryPage,
  type MemoryRecord,
  memoryOriginLabel,
  memoryStateLabel,
} from "../../../shared/memorySchemas"
import "../knowledge/knowledge.css"
import "./memory.css"

export interface MemoryInspectorProps {
  readonly page: MemoryPage
  readonly navigationRecents: readonly MemoryNavigationRecent[]
  readonly projectName?: string | undefined
  readonly pendingActionId: MemoryId | null
  readonly onPageChange: (page: number) => void
  readonly onApprove: (id: MemoryId) => void | Promise<void>
  readonly onReject: (id: MemoryId) => void | Promise<void>
  readonly onForget: (id: MemoryId) => void | Promise<void>
}

export function MemoryInspector({
  page,
  navigationRecents,
  projectName,
  pendingActionId,
  onPageChange,
  onApprove,
  onReject,
  onForget,
}: MemoryInspectorProps): JSX.Element {
  return (
    <section className="knowledge-pane memory-inspector" aria-label="메모리 검사">
      <header className="knowledge-header memory-inspector-header">
        <div>
          <h2>메모리 검사</h2>
          <p className="knowledge-help">
            승인된 의미 기억만 제한적으로 검색됩니다. 출처와 상태를 확인한 뒤 직접 결정하세요.
          </p>
        </div>
        <span className="knowledge-badge">로컬 전용</span>
      </header>

      <div className="memory-inspector-body">
        <section aria-labelledby="semantic-memory-heading">
          <div className="memory-inspector-section-heading">
            <div>
              <h3 id="semantic-memory-heading" className="knowledge-detail-title">
                의미 기억
              </h3>
              <p className="knowledge-help">대기, 승인, 거부, 무효화 기록을 보존합니다.</p>
            </div>
            <span className="knowledge-status">{page.records.length}개 표시</span>
          </div>
          {page.records.length === 0 ? (
            <p className="knowledge-card knowledge-empty">표시할 의미 기억이 없습니다.</p>
          ) : (
            <ul className="memory-inspector-list">
              {page.records.map((record) => (
                <MemoryCard
                  key={record.id}
                  record={record}
                  projectName={projectName}
                  busy={pendingActionId === record.id}
                  onApprove={onApprove}
                  onReject={onReject}
                  onForget={onForget}
                />
              ))}
            </ul>
          )}
          <nav className="memory-inspector-pagination" aria-label="의미 기억 페이지">
            <button
              type="button"
              className="knowledge-btn"
              disabled={page.page === 0}
              onClick={() => onPageChange(page.page - 1)}
            >
              이전
            </button>
            <span className="knowledge-status">페이지 {page.page + 1}</span>
            <button
              type="button"
              className="knowledge-btn"
              disabled={!page.hasNextPage}
              onClick={() => onPageChange(page.page + 1)}
            >
              다음
            </button>
          </nav>
        </section>

        <section aria-labelledby="navigation-recents-heading">
          <div className="memory-inspector-section-heading">
            <div>
              <h3 id="navigation-recents-heading" className="knowledge-detail-title">
                최근 사실 탐색
              </h3>
              <p className="knowledge-help">의미 기억과 분리된 최근 탐색 최대 100건입니다.</p>
            </div>
            <Clock3 size={16} aria-hidden="true" />
          </div>
          {navigationRecents.length === 0 ? (
            <p className="knowledge-card knowledge-empty">최근 탐색 기록이 없습니다.</p>
          ) : (
            <ol className="memory-inspector-recents">
              {navigationRecents.map((recent) => (
                <li key={recent.id} className="knowledge-card memory-inspector-recent">
                  <div className="memory-inspector-recent-heading">
                    <MapPin size={14} aria-hidden="true" />
                    <strong>{recent.fact}</strong>
                  </div>
                  <span className="knowledge-help">
                    {recent.kind} · {recent.sourceKey} · {recent.sourceRevision}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  )
}

interface MemoryCardProps {
  readonly record: MemoryRecord
  readonly projectName?: string | undefined
  readonly busy: boolean
  readonly onApprove: (id: MemoryId) => void | Promise<void>
  readonly onReject: (id: MemoryId) => void | Promise<void>
  readonly onForget: (id: MemoryId) => void | Promise<void>
}

function MemoryCard({
  record,
  projectName,
  busy,
  onApprove,
  onReject,
  onForget,
}: MemoryCardProps): JSX.Element {
  const canReview = record.state === "pending"
  const canForget = record.state === "accepted"
  return (
    <li className="knowledge-card memory-inspector-card" data-state={record.state}>
      <div className="memory-inspector-card-heading">
        <span className="knowledge-badge">{memoryStateLabel(record.state)}</span>
        <span className="knowledge-status">{memoryOriginLabel(record.origin)}</span>
        <span className="knowledge-status">{collectionLabel(projectName)}</span>
      </div>
      <p className="memory-inspector-text">{record.text}</p>
      <dl className="memory-inspector-metadata">
        <div>
          <dt>근거</dt>
          <dd>{record.evidence.length}개</dd>
        </div>
        <div>
          <dt>리비전</dt>
          <dd>{record.revision}</dd>
        </div>
        <div>
          <dt>보수적 토큰 상한</dt>
          <dd>{record.conservativeTokenEstimate}</dd>
        </div>
        <div>
          <dt>생성</dt>
          <dd>{record.createdAt}</dd>
        </div>
        <div>
          <dt>수정</dt>
          <dd>{record.updatedAt}</dd>
        </div>
      </dl>
      {record.evidence.length > 0 ? (
        <ul className="memory-inspector-evidence">
          {record.evidence.map((evidence) => (
            <li key={JSON.stringify(evidence)}>
              <span className="knowledge-help">
                {evidence.sourceKey} · {evidence.sourceRevision}
              </span>
              {evidence.quote ? <q>{evidence.quote}</q> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="knowledge-help">연결된 근거 없음</p>
      )}
      <div className="memory-inspector-actions">
        {canReview ? (
          <>
            <button
              type="button"
              className="knowledge-btn knowledge-btn-primary"
              disabled={busy}
              onClick={() => void onApprove(record.id)}
            >
              <Check size={14} aria-hidden="true" /> 승인
            </button>
            <button
              type="button"
              className="knowledge-btn"
              disabled={busy}
              onClick={() => void onReject(record.id)}
            >
              <Ban size={14} aria-hidden="true" /> 거부
            </button>
          </>
        ) : null}
        {canForget ? (
          <button
            type="button"
            className="knowledge-btn"
            disabled={busy}
            onClick={() => void onForget(record.id)}
          >
            <Trash2 size={14} aria-hidden="true" /> 잊기
          </button>
        ) : null}
      </div>
    </li>
  )
}

function collectionLabel(projectName: string | undefined): string {
  const trimmed = projectName?.trim()
  return trimmed ? `이 컬렉션 · ${trimmed}` : "이 컬렉션"
}
