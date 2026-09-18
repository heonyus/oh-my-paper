import type { FormEvent, JSX } from "react"
import { useEffect, useRef, useState } from "react"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ResearchApi } from "../../../shared/researchIpc"
import {
  defaultResearchBudgets,
  type ResearchJobSnapshot,
} from "../../../shared/researchJobSchemas"
import { ResearchBudgetFields } from "./ResearchBudgetFields"
import { ResearchHistory } from "./ResearchHistory"
import { ResearchJobPanel } from "./ResearchJobPanel"
import "./research.css"

export interface ResearchViewProps {
  readonly research: ResearchApi
  readonly active?: boolean
  readonly localSourceIds?: readonly KnowledgeNodeId[]
  readonly onOpenLocalSource?: (nodeId: KnowledgeNodeId) => void
  readonly onOpenReport?: (nodeId: KnowledgeNodeId) => void
}

export function ResearchView({
  research,
  active = true,
  localSourceIds = [],
  onOpenLocalSource,
  onOpenReport,
}: ResearchViewProps): JSX.Element {
  const [question, setQuestion] = useState("")
  const [external, setExternal] = useState(true)
  const [budgets, setBudgets] = useState(defaultResearchBudgets)
  const [job, setJob] = useState<ResearchJobSnapshot | null>(null)
  const [previousJobs, setPreviousJobs] = useState<readonly ResearchJobSnapshot[]>([])
  const [consented, setConsented] = useState(false)
  const [reportTitle, setReportTitle] = useState("")
  const [reportMarkdown, setReportMarkdown] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [previewPending, setPreviewPending] = useState(false)
  const [mutationPending, setMutationPending] = useState(false)
  const previewPendingRef = useRef(false)
  const mutationPendingRef = useRef(false)
  const requestGeneration = useRef(0)

  useEffect(
    () => () => {
      requestGeneration.current += 1
      previewPendingRef.current = false
      mutationPendingRef.current = false
    },
    [],
  )

  useEffect(() => {
    let mounted = true
    void research
      .list()
      .then((jobs) => {
        if (mounted) setPreviousJobs(jobs)
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : "이전 조사 목록을 읽지 못했습니다.")
        }
      })
    return () => {
      mounted = false
    }
  }, [research])

  useEffect(() => {
    if (!active || job?.status !== "running") return
    const generation = ++requestGeneration.current
    const runningJobId = job.id
    let disposed = false
    let timer: number | null = null

    async function poll(): Promise<void> {
      try {
        const next = await research.status({ jobId: runningJobId })
        if (disposed || requestGeneration.current !== generation) return
        if (next === null) {
          setError("저장된 연구 작업을 찾지 못했습니다.")
          return
        }
        setJob(next)
        setPreviousJobs((current) => [next, ...current.filter(({ id }) => id !== next.id)])
        if (next.status === "running") timer = window.setTimeout(() => void poll(), 500)
      } catch (cause: unknown) {
        if (disposed || requestGeneration.current !== generation) return
        setError(cause instanceof Error ? cause.message : "연구 상태를 읽지 못했습니다.")
      }
    }

    void poll()
    return () => {
      disposed = true
      if (timer !== null) window.clearTimeout(timer)
      if (requestGeneration.current === generation) requestGeneration.current += 1
    }
  }, [active, job?.id, job?.status, research])

  useEffect(() => {
    if (job?.report === null || job?.report === undefined) return
    setReportTitle(job.report.title)
    setReportMarkdown(job.report.markdown)
  }, [job?.report])

  async function preview(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (previewPendingRef.current) return
    const generation = ++requestGeneration.current
    previewPendingRef.current = true
    setPreviewPending(true)
    setError(null)
    setConsented(false)
    try {
      const next = await research.preview({
        input: {
          question,
          provider: "codex_subscription",
          scope: { external, localSourceIds },
          budgets,
        },
      })
      if (requestGeneration.current !== generation) return
      setJob(next)
      setPreviousJobs((current) => [next, ...current.filter(({ id }) => id !== next.id)])
    } catch (cause) {
      if (requestGeneration.current === generation) {
        setError(cause instanceof Error ? cause.message : "연구 미리보기를 만들지 못했습니다.")
      }
    } finally {
      previewPendingRef.current = false
      setPreviewPending(false)
    }
  }

  async function update(action: () => Promise<ResearchJobSnapshot>): Promise<void> {
    if (mutationPendingRef.current) return
    mutationPendingRef.current = true
    setMutationPending(true)
    const generation = ++requestGeneration.current
    setError(null)
    try {
      const next = await action()
      if (requestGeneration.current !== generation) return
      setJob(next)
      setPreviousJobs((current) => [next, ...current.filter(({ id }) => id !== next.id)])
    } catch (cause) {
      if (requestGeneration.current === generation) {
        setError(cause instanceof Error ? cause.message : "연구 작업을 변경하지 못했습니다.")
      }
    } finally {
      mutationPendingRef.current = false
      setMutationPending(false)
    }
  }

  function scopeKey(snapshot: ResearchJobSnapshot): string {
    return JSON.stringify({
      question: snapshot.input.question,
      provider: snapshot.input.provider,
      scope: snapshot.input.scope,
      budgets: snapshot.input.budgets,
    })
  }

  function restoreJob(next: ResearchJobSnapshot): void {
    requestGeneration.current += 1
    if (job === null || scopeKey(job) !== scopeKey(next)) setConsented(false)
    setJob(next)
    setError(null)
  }

  return (
    <main className="research-view" aria-labelledby="research-title">
      <header>
        <p className="research-kicker">Deep research</p>
        <h1 id="research-title">근거 조사</h1>
        <p>범위와 한도를 먼저 확인한 뒤에만 자료 읽기, 웹 검색, AI 실행을 시작합니다.</p>
      </header>

      <form className="research-form" onSubmit={(event) => void preview(event)}>
        <label className="research-question">
          <span>조사 질문</span>
          <textarea
            required
            maxLength={1_000}
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
          />
        </label>
        <label className="research-check">
          <input
            type="checkbox"
            checked={external}
            onChange={(event) => setExternal(event.currentTarget.checked)}
          />
          공식 Codex 구독 웹 검색 사용 요청 (시작 후 가용성 확인)
        </label>
        <ResearchBudgetFields value={budgets} onChange={setBudgets} />
        <button
          type="submit"
          disabled={previewPending || (!external && localSourceIds.length === 0)}
        >
          {previewPending ? "미리보기 준비 중…" : "범위 미리보기"}
        </button>
      </form>
      <ResearchHistory jobs={previousJobs} onRestore={restoreJob} />

      {job ? (
        <ResearchJobPanel
          job={job}
          research={research}
          consented={consented}
          reportTitle={reportTitle}
          reportMarkdown={reportMarkdown}
          onConsented={setConsented}
          onReportTitle={setReportTitle}
          onReportMarkdown={setReportMarkdown}
          onUpdate={update}
          mutationPending={mutationPending}
          onOpenLocalSource={onOpenLocalSource}
          onOpenReport={onOpenReport}
        />
      ) : null}
      {error ? (
        <p className="research-error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  )
}
