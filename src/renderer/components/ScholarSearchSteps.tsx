import { AlertCircle, Check, Loader2 } from "lucide-react"
import type { JSX } from "react"
import type { ScholarlySearchStep } from "../../shared/scholarlySearchSchemas"

const providerLabels: Readonly<Record<NonNullable<ScholarlySearchStep["provider"]>, string>> = {
  crossref: "Crossref",
  arxiv: "arXiv",
  openalex: "OpenAlex",
}

const providerErrorLabels: Readonly<Record<string, string>> = {
  rate_limited: "요청 한도 초과",
  timeout: "시간 초과",
  oversized: "응답 초과",
  cancelled: "취소됨",
  network: "네트워크 오류",
  http_error: "HTTP 오류",
  malformed_response: "응답 형식 오류",
}

function stepLabel(step: ScholarlySearchStep): string {
  switch (step.kind) {
    case "provider": {
      const name = step.provider ? providerLabels[step.provider] : "검색"
      if (step.status === "running") return `${name} 조회 중…`
      if (step.status === "failed")
        return `${name} 실패 · ${providerErrorLabels[step.detail ?? ""] ?? step.detail ?? "오류"}`
      return `${name} ${step.found ?? 0}건${step.detail === "cached" ? " (캐시)" : ""}`
    }
    case "merge":
      if (step.status === "running") return "출처별 결과 합치는 중…"
      if (step.status === "failed") return "결과 병합 실패"
      return `출처별 결과 병합 · 후보 ${step.found ?? 0}편`
    case "rank":
      if (step.status === "running") return "현재 논문과의 관련도 계산 중…"
      if (step.status === "failed") return "관련도 계산 실패"
      return `관련도 순 정렬 · ${step.found ?? 0}편 통과`
    case "judge":
      if (step.status === "running") return `Jev가 후보 ${step.found ?? 0}편 읽고 판정 중…`
      if (step.status === "failed")
        return step.detail ?? "Jev 판정을 사용할 수 없어 규칙 기반으로 정렬"
      return step.detail ?? "Jev 판정 완료"
  }
}

function StepIcon({ status }: { readonly status: ScholarlySearchStep["status"] }): JSX.Element {
  if (status === "running")
    return <Loader2 size={13} className="scholar-search-step-spin" aria-hidden="true" />
  if (status === "failed") return <AlertCircle size={13} aria-hidden="true" />
  return <Check size={13} aria-hidden="true" />
}

/** Replaces a step with the same id so a running step turns into its finished form in place. */
export function upsertStep(
  steps: readonly ScholarlySearchStep[],
  step: ScholarlySearchStep,
): readonly ScholarlySearchStep[] {
  const index = steps.findIndex((existing) => existing.id === step.id)
  if (index < 0) return [...steps, step]
  return steps.map((existing, position) => (position === index ? step : existing))
}

export function ScholarSearchSteps({
  steps,
}: {
  readonly steps: readonly ScholarlySearchStep[]
}): JSX.Element {
  return (
    <ol className="scholar-search-steps" aria-label="검색 진행 상황">
      {steps.map((step) => (
        <li key={step.id} className={`scholar-search-step scholar-search-step-${step.status}`}>
          <StepIcon status={step.status} />
          <span>{stepLabel(step)}</span>
        </li>
      ))}
    </ol>
  )
}
