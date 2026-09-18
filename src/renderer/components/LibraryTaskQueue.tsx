import { Check, FileText, LoaderCircle, TriangleAlert } from "lucide-react"
import { type JSX, useState } from "react"
import type { DocumentAnalysisJob } from "../../shared/documentAnalysis"
import type { ImportProgress } from "../../shared/ipc"

type LibraryTask = {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly progress: number
  readonly state: "active" | "complete" | "failed"
}

const stageLabels: Readonly<
  Record<Extract<DocumentAnalysisJob, { state: "running" }>["stage"], string>
> = {
  "engine-starting": "분석 엔진 준비 중",
  "page-rendering": "페이지 읽는 중",
  "document-analyzing": "구조 분석 중",
  finalizing: "결과 저장 중",
}

const stageProgress: Readonly<
  Record<Extract<DocumentAnalysisJob, { state: "running" }>["stage"], number>
> = {
  "engine-starting": 0.05,
  "page-rendering": 0.2,
  "document-analyzing": 0.6,
  finalizing: 0.9,
}

function analysisTask(job: DocumentAnalysisJob): LibraryTask {
  if (job.state === "queued") {
    return {
      id: `analysis:${job.id}`,
      title: job.title,
      detail: `0 / ${job.pageCount}페이지 · 분석 대기 중`,
      progress: 0,
      state: "active",
    }
  }
  if (job.state === "running") {
    return {
      id: `analysis:${job.id}`,
      title: job.title,
      detail: `${job.currentPage} / ${job.pageCount}페이지 · ${stageLabels[job.stage]}`,
      progress: (job.completedPages + stageProgress[job.stage]) / job.pageCount,
      state: "active",
    }
  }
  if (job.state === "complete") {
    return {
      id: `analysis:${job.id}`,
      title: job.title,
      detail: `${job.pageCount} / ${job.pageCount}페이지 · 로컬 분석 완료`,
      progress: 1,
      state: "complete",
    }
  }
  return {
    id: `analysis:${job.id}`,
    title: job.title,
    detail: `${job.completedPages} / ${job.pageCount}페이지 · ${job.message}`,
    progress: job.completedPages / job.pageCount,
    state: "failed",
  }
}

function importTask(item: ImportProgress): LibraryTask {
  return {
    id: `import:${item.id}`,
    title: item.fileName,
    detail: item.message,
    progress: item.progress,
    state: item.state === "failed" ? "failed" : item.progress === 1 ? "complete" : "active",
  }
}

export function LibraryTaskQueue({
  imports,
  analyses,
}: {
  readonly imports: readonly ImportProgress[]
  readonly analyses: readonly DocumentAnalysisJob[]
}): JSX.Element | null {
  const [showCompleted, setShowCompleted] = useState(false)
  const tasks = [...imports.map(importTask), ...analyses.map(analysisTask)]
  if (tasks.length === 0) return null
  const active = tasks.filter((task) => task.state === "active").length
  const failed = tasks.filter((task) => task.state === "failed").length
  const expanded = active > 0 || failed > 0 || showCompleted

  return (
    <section className="library-task-queue" aria-live="polite" aria-label="PDF 준비 진행">
      <header>
        <div>
          {active > 0 ? (
            <LoaderCircle size={15} aria-hidden="true" />
          ) : (
            <Check size={15} aria-hidden="true" />
          )}
          <h2>
            {active > 0 || failed > 0 ? "로컬 문서 준비" : `${tasks.length}개 문서 준비 완료`}
          </h2>
        </div>
        {active > 0 || failed > 0 ? (
          <span className="library-task-summary">
            {active > 0 ? `${active}개 진행 중` : `${failed}개 확인 필요`}
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setShowCompleted((current) => !current)}
          >
            {expanded ? "접기" : "완료 내역"}
          </button>
        )}
      </header>
      {expanded ? (
        <ul>
          {tasks.map((task) => (
            <li key={task.id} data-state={task.state}>
              <span className="library-task-icon" aria-hidden="true">
                {task.state === "failed" ? (
                  <TriangleAlert size={14} />
                ) : task.state === "complete" ? (
                  <Check size={14} />
                ) : (
                  <FileText size={14} />
                )}
              </span>
              <div className="library-task-copy">
                <strong>{task.title}</strong>
                <span className="library-task-detail">{task.detail}</span>
                <div
                  className="library-task-progress"
                  role="progressbar"
                  aria-label={`${task.title} 준비 진행`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(task.progress * 100)}
                >
                  <span
                    className="library-task-fill"
                    style={{ width: `${Math.max(0, Math.min(1, task.progress)) * 100}%` }}
                  />
                  {task.state === "active" ? <i className="library-task-flow" /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
