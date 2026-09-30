import { Check, FileText, LoaderCircle, TriangleAlert } from "lucide-react"
import { type JSX, useState } from "react"
import type { DocumentAnalysisJob, DocumentAnalysisSnapshot } from "../../shared/documentAnalysis"
import type { MessageParams } from "../../shared/i18n/locale"
import type { ImportProgress } from "../../shared/ipc"
import { useTranslator } from "../lib/locale"
import { countKey, type LibraryMessageKey, libraryMessages } from "../messages/library"

type LibraryTask = {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly progress: number
  readonly state: "active" | "complete" | "failed"
  readonly retryDocumentId?: DocumentAnalysisJob["id"] | undefined
}

type RunningStage = Extract<DocumentAnalysisJob, { state: "running" }>["stage"]
type Translate = (key: LibraryMessageKey, params?: MessageParams) => string

const stageLabels: Readonly<Record<RunningStage, LibraryMessageKey>> = {
  "engine-starting": "tasks.stage.engine-starting",
  "page-rendering": "tasks.stage.page-rendering",
  "document-analyzing": "tasks.stage.document-analyzing",
  finalizing: "tasks.stage.finalizing",
}

const stageProgress: Readonly<Record<RunningStage, number>> = {
  "engine-starting": 0.05,
  "page-rendering": 0.2,
  "document-analyzing": 0.6,
  finalizing: 0.9,
}

function analysisTask(job: DocumentAnalysisJob, t: Translate): LibraryTask {
  const pages = (current: number): string => t("tasks.pages", { current, total: job.pageCount })
  if (job.state === "queued") {
    return {
      id: `analysis:${job.id}`,
      title: job.title,
      detail: `${pages(0)} · ${job.message ?? t("tasks.waiting")}`,
      progress: 0,
      state: "active",
    }
  }
  if (job.state === "running") {
    const retry =
      job.maxAttempts > 1
        ? ` · ${t("tasks.attempt", { attempt: job.attempt, max: job.maxAttempts })}`
        : ""
    return {
      id: `analysis:${job.id}`,
      title: job.title,
      detail: `${pages(job.currentPage)} · ${t("tasks.localOcr")}${retry} · ${t(stageLabels[job.stage])}`,
      progress: (job.completedPages + stageProgress[job.stage]) / job.pageCount,
      state: "active",
    }
  }
  if (job.state === "complete") {
    return {
      id: `analysis:${job.id}`,
      title: job.title,
      detail: `${pages(job.pageCount)} · ${t("tasks.done")}`,
      progress: 1,
      state: "complete",
    }
  }
  return {
    id: `analysis:${job.id}`,
    title: job.title,
    detail: `${pages(job.completedPages)} · ${job.message}`,
    progress: job.completedPages / job.pageCount,
    state: "failed",
    retryDocumentId: job.id,
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

/** What the jobs the snapshot only counts are doing, e.g. "3개 분석 대기 중 · 1개 확인 필요". */
function unlistedDetail(unlisted: DocumentAnalysisSnapshot["unlisted"], t: Translate): string {
  return [
    unlisted.running > 0 ? t("tasks.analyzing", { count: unlisted.running }) : "",
    unlisted.queued > 0 ? t("tasks.queued", { count: unlisted.queued }) : "",
    unlisted.failed > 0
      ? t(countKey("tasks.needsCheck", unlisted.failed), { count: unlisted.failed })
      : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

export function LibraryTaskQueue({
  imports,
  analyses,
  onRetryAnalysis,
}: {
  readonly imports: readonly ImportProgress[]
  readonly analyses: DocumentAnalysisSnapshot
  readonly onRetryAnalysis?: ((id: DocumentAnalysisJob["id"]) => void) | undefined
}): JSX.Element | null {
  const t = useTranslator(libraryMessages)
  const [showCompleted, setShowCompleted] = useState(false)
  const tasks = [...imports.map(importTask), ...analyses.jobs.map((job) => analysisTask(job, t))]
  const { unlisted } = analyses
  const unlistedActive = unlisted.queued + unlisted.running
  const unlistedCount = unlistedActive + unlisted.failed
  if (tasks.length === 0 && unlistedCount === 0) return null
  const active = tasks.filter((task) => task.state === "active").length + unlistedActive
  const failed = tasks.filter((task) => task.state === "failed").length + unlisted.failed
  const expanded = active > 0 || failed > 0 || showCompleted

  return (
    <section className="library-task-queue" aria-live="polite" aria-label={t("tasks.label")}>
      <header>
        <div>
          {active > 0 ? (
            <LoaderCircle size={15} aria-hidden="true" />
          ) : (
            <Check size={15} aria-hidden="true" />
          )}
          <h2>
            {active > 0 || failed > 0
              ? t("tasks.preparing")
              : t(countKey("tasks.ready", tasks.length), { count: tasks.length })}
          </h2>
        </div>
        {active > 0 || failed > 0 ? (
          <span className="library-task-summary">
            {active > 0
              ? t("tasks.active", { count: active })
              : t(countKey("tasks.needsCheck", failed), { count: failed })}
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setShowCompleted((current) => !current)}
          >
            {t(expanded ? "tasks.collapse" : "tasks.completed")}
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
                  aria-label={t("tasks.progressLabel", { title: task.title })}
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
                {task.retryDocumentId && onRetryAnalysis ? (
                  <button
                    type="button"
                    className="library-task-retry"
                    aria-label={t("tasks.retryLabel", { title: task.title })}
                    onClick={() => {
                      if (task.retryDocumentId) onRetryAnalysis(task.retryDocumentId)
                    }}
                  >
                    {t("tasks.retry")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {unlistedCount > 0 ? (
            <li data-state={unlistedActive > 0 ? "active" : "failed"}>
              <span className="library-task-icon" aria-hidden="true">
                <FileText size={14} />
              </span>
              <div className="library-task-copy">
                <strong>
                  {t(countKey("tasks.more", unlistedCount), { count: unlistedCount })}
                </strong>
                <span className="library-task-detail">{unlistedDetail(unlisted, t)}</span>
              </div>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}
