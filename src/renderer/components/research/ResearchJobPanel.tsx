import type { JSX } from "react"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ResearchApi } from "../../../shared/researchIpc"
import type { ResearchJobSnapshot } from "../../../shared/researchJobSchemas"
import { ResearchReportEditor } from "./ResearchReportEditor"
import { ResearchSources } from "./ResearchSources"

const statusText: Readonly<Record<ResearchJobSnapshot["status"], string>> = {
  awaiting_start: "시작 전",
  running: "진행 중",
  paused: "일시 중지",
  cancelled: "취소됨",
  failed: "실패",
  completed: "완료",
}

interface ResearchJobPanelProps {
  readonly job: ResearchJobSnapshot
  readonly research: ResearchApi
  readonly consented: boolean
  readonly reportTitle: string
  readonly reportMarkdown: string
  readonly onConsented: (value: boolean) => void
  readonly onReportTitle: (value: string) => void
  readonly onReportMarkdown: (value: string) => void
  readonly onUpdate: (action: () => Promise<ResearchJobSnapshot>) => Promise<void>
  readonly mutationPending?: boolean
  readonly onOpenLocalSource?: ((nodeId: KnowledgeNodeId) => void) | undefined
  readonly onOpenReport?: ((nodeId: KnowledgeNodeId) => void) | undefined
}

export function ResearchJobPanel({
  job,
  research,
  consented,
  reportTitle,
  reportMarkdown,
  onConsented,
  onReportTitle,
  onReportMarkdown,
  onUpdate,
  mutationPending = false,
  onOpenLocalSource,
  onOpenReport,
}: ResearchJobPanelProps): JSX.Element {
  const canResume =
    job.status === "paused" &&
    job.pauseReason !== "budget_reached" &&
    job.pauseReason !== "time_reached"

  return (
    <section className="research-job" aria-live="polite" aria-busy={job.status === "running"}>
      <div className="research-job-heading">
        <div>
          <span className="research-status">{statusText[job.status]}</span>
          <strong>{job.input.question}</strong>
        </div>
        <span>{job.phase}</span>
      </div>
      <dl className="research-counts">
        <div>
          <dt>검색</dt>
          <dd>
            {job.counts.searchRounds}/{job.input.budgets.searchRounds}
          </dd>
        </div>
        <div>
          <dt>자료 시도</dt>
          <dd>
            {job.counts.sourcesAttempted}/{job.input.budgets.sources}
          </dd>
        </div>
        <div>
          <dt>모델 턴</dt>
          <dd>
            {job.counts.modelTurns}/{job.input.budgets.modelTurns}
          </dd>
        </div>
        <div>
          <dt>사용량</dt>
          <dd>
            {job.providerUsage.state === "unknown"
              ? "확인되지 않음"
              : `${job.providerUsage.inputTokens + job.providerUsage.outputTokens} tokens`}
          </dd>
        </div>
      </dl>
      <ResearchSources sources={job.sources} onOpenLocalSource={onOpenLocalSource} />

      {job.status === "awaiting_start" ? (
        <div className="research-consent">
          <label className="research-check">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => onConsented(event.currentTarget.checked)}
            />
            위 범위 안에서 자료 본문 읽기, 검색, AI 실행을 허용합니다.
          </label>
          <button
            type="button"
            disabled={!consented || mutationPending}
            onClick={() => void onUpdate(() => research.start({ jobId: job.id }))}
          >
            조사 시작
          </button>
        </div>
      ) : null}
      {job.status === "running" ? (
        <button
          type="button"
          disabled={mutationPending}
          onClick={() => void onUpdate(() => research.cancel({ jobId: job.id }))}
        >
          취소
        </button>
      ) : null}
      {canResume ? (
        <button
          type="button"
          disabled={mutationPending}
          onClick={() => void onUpdate(() => research.resume({ jobId: job.id }))}
        >
          명시적으로 재개
        </button>
      ) : null}
      {job.pauseReason ? <p className="research-warning">중지 이유: {job.pauseReason}</p> : null}
      {job.error ? (
        <p className="research-error" role="alert">
          {job.error}
        </p>
      ) : null}

      <ResearchReportEditor
        job={job}
        title={reportTitle}
        markdown={reportMarkdown}
        onTitle={onReportTitle}
        onMarkdown={onReportMarkdown}
        onSave={() =>
          onUpdate(() =>
            research.saveReport({
              jobId: job.id,
              title: reportTitle,
              markdown: reportMarkdown,
            }),
          )
        }
        mutationPending={mutationPending}
        onOpenReport={onOpenReport}
      />
    </section>
  )
}
