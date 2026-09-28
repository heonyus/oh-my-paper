import { AlertCircle, Check, Loader2 } from "lucide-react"
import type { JSX } from "react"
import type { AgentStep } from "../../shared/agentChat"

function stepLabel(step: AgentStep): string {
  const query = step.query ? `"${step.query}"` : ""
  switch (step.kind) {
    case "context":
      return `라이브러리 첨부 논문 ${step.found ?? 0}편 불러옴`
    case "plan":
      if (step.status === "running") return "질문 이해 · 검색 계획 세우는 중…"
      if (step.status === "failed") return "검색 계획을 세우지 못해 질문 그대로 검색합니다"
      return step.detail
        ? `검색 계획: ${step.detail}`
        : `검색어 ${step.queries?.length ?? 0}개 준비`
    case "search":
      if (step.status === "running") return `${query} 검색 중…`
      if (step.status === "failed") return `${query} 검색 실패`
      return `${query} — 새 논문 ${step.found ?? 0}편`
    case "fallback":
      if (step.status === "running") return `${query} — 보조 검색 중…`
      if (step.status === "failed") return `${query} — 보조 검색 실패`
      return `${query} — 보조 검색 ${step.found ?? 0}편`
    case "judge":
      if (step.status === "running") return `후보 ${step.found ?? 0}편의 관련성 판정 중…`
      if (step.status === "failed") return "관련성 판정 실패"
      return `관련 논문 ${step.found ?? 0}편 확인`
    case "expand":
      if (step.status === "running") return "관련 논문의 추천·참고문헌·피인용 따라가는 중…"
      if (step.status === "failed") return "인용·추천 확장 실패"
      return `인용·추천에서 새 논문 ${step.found ?? 0}편`
    case "compose":
      if (step.status === "running") return "찾은 논문을 근거로 답변 작성 중…"
      if (step.status === "failed") return "답변 작성 실패"
      return step.detail ? `답변 완성 · ${step.detail}` : "답변 완성"
  }
}

/** Source breakdowns and judge summaries; the plan's detail is already in its label. */
function stepDetail(step: AgentStep): string | null {
  if (step.status === "running" || !step.detail) return null
  return step.kind === "search" || step.kind === "expand" || step.kind === "judge"
    ? step.detail
    : null
}

function StepIcon({ status }: { readonly status: AgentStep["status"] }): JSX.Element {
  if (status === "running")
    return <Loader2 size={13} className="research-step-spin" aria-hidden="true" />
  if (status === "failed") return <AlertCircle size={13} aria-hidden="true" />
  return <Check size={13} aria-hidden="true" />
}

export function AgentStepList({ steps }: { readonly steps: readonly AgentStep[] }): JSX.Element {
  return (
    <ol className="research-steps">
      {steps.map((step) => {
        const detail = stepDetail(step)
        return (
          <li key={step.id} className={`research-step research-step-${step.status}`}>
            <StepIcon status={step.status} />
            <span>
              {stepLabel(step)}
              {detail ? <span className="research-step-detail">{detail}</span> : null}
              {step.kind === "plan" && step.queries && step.queries.length > 0 ? (
                <span className="research-step-queries">
                  {step.queries.map((query) => (
                    <code key={query}>{query}</code>
                  ))}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
