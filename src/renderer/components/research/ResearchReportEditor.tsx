import type { JSX } from "react"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ResearchJobSnapshot } from "../../../shared/researchJobSchemas"

interface ResearchReportEditorProps {
  readonly job: ResearchJobSnapshot
  readonly title: string
  readonly markdown: string
  readonly onTitle: (value: string) => void
  readonly onMarkdown: (value: string) => void
  readonly onSave: () => Promise<void>
  readonly mutationPending?: boolean
  readonly onOpenReport?: ((nodeId: KnowledgeNodeId) => void) | undefined
}

export function ResearchReportEditor(props: ResearchReportEditorProps): JSX.Element | null {
  const { job } = props
  if (job.report === null) return null
  return (
    <div className="research-report">
      <label>
        <span>보고서 제목</span>
        <input value={props.title} onChange={(event) => props.onTitle(event.currentTarget.value)} />
      </label>
      <label>
        <span>Markdown 보고서</span>
        <textarea
          value={props.markdown}
          onChange={(event) => props.onMarkdown(event.currentTarget.value)}
        />
      </label>
      <p className="research-warning">AI가 작성한 초안입니다. 인용과 해석을 원문에서 확인하세요.</p>
      {job.report.partial ? (
        <p className="research-warning">부분 또는 metadata-only 근거가 포함되어 있습니다.</p>
      ) : null}
      {job.phase === "report_ready" ? (
        <button
          type="button"
          disabled={props.mutationPending === true}
          onClick={() => void props.onSave()}
        >
          {props.mutationPending ? "노트 저장 중…" : "편집본을 노트로 저장"}
        </button>
      ) : null}
      {job.reportNodeId && props.onOpenReport ? (
        <button
          type="button"
          onClick={() => {
            if (job.reportNodeId !== null) props.onOpenReport?.(job.reportNodeId)
          }}
        >
          저장한 보고서 열기
        </button>
      ) : null}
    </div>
  )
}
