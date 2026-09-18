import type { JSX } from "react"
import type { ResearchJobSnapshot } from "../../../shared/researchJobSchemas"
import "./researchHistory.css"

interface ResearchHistoryProps {
  readonly jobs: readonly ResearchJobSnapshot[]
  readonly onRestore: (job: ResearchJobSnapshot) => void
}

export function ResearchHistory({ jobs, onRestore }: ResearchHistoryProps): JSX.Element {
  return (
    <aside className="research-history" aria-labelledby="research-history-title">
      <h2 id="research-history-title">이전 조사</h2>
      {jobs.length === 0 ? <p>저장된 조사 작업이 없습니다.</p> : null}
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            <div>
              <strong>{job.input.question}</strong>
              <span>
                {job.status} · {new Date(job.updatedAt).toLocaleString()}
              </span>
            </div>
            <button type="button" onClick={() => onRestore(job)}>
              복원
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
