import { AlertCircle, Check, Loader2 } from "lucide-react"
import type { JSX } from "react"
import { useTranslator } from "../../renderer/lib/locale"
import type { AgentStep } from "../../shared/agentChat"
import type { MessageParams } from "../../shared/i18n/locale"
import { researchViewMessages } from "./messages"

const maxQueryLabel = 60

function stepLabel(
  step: AgentStep,
  t: (key: keyof typeof researchViewMessages.ko, params?: MessageParams) => string,
): string {
  const text = step.query ?? ""
  const clipped = text.length > maxQueryLabel ? `${text.slice(0, maxQueryLabel)}…` : text
  const query = clipped ? `"${clipped}"` : ""
  const count = step.found ?? 0
  switch (step.kind) {
    case "context":
      return t("step.context", { count })
    case "plan":
      if (step.status === "running") return t("step.planRunning")
      if (step.status === "failed") return t("step.planFailed")
      return step.detail
        ? t("step.planDetail", { detail: step.detail })
        : t("step.planDone", { count: step.queries?.length ?? 0 })
    case "search":
      if (step.status === "running") return t("step.searchRunning", { query })
      if (step.status === "failed") return t("step.searchFailed", { query })
      return t("step.searchDone", { query, count })
    case "fallback":
      if (step.status === "running") return t("step.fallbackRunning", { query })
      if (step.status === "failed") return t("step.fallbackFailed", { query })
      return t("step.fallbackDone", { query, count })
    case "judge":
      if (step.status === "running") return t("step.judgeRunning", { count })
      if (step.status === "failed") return t("step.judgeFailed")
      return t("step.judgeDone", { count })
    case "expand":
      if (step.status === "running") return t("step.expandRunning")
      if (step.status === "failed") return t("step.expandFailed")
      return t("step.expandDone", { count })
    case "compose":
      if (step.status === "running") return t("step.composeRunning")
      if (step.status === "failed") return t("step.composeFailed")
      return step.detail ? t("step.composeDetail", { detail: step.detail }) : t("step.composeDone")
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
  const t = useTranslator(researchViewMessages)
  return (
    <ol className="research-steps">
      {steps.map((step) => {
        const detail = stepDetail(step)
        return (
          <li key={step.id} className={`research-step research-step-${step.status}`}>
            <StepIcon status={step.status} />
            <span>
              {stepLabel(step, t)}
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
