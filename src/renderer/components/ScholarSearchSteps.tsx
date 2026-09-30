import { AlertCircle, Check, Loader2 } from "lucide-react"
import type { JSX } from "react"
import type { MessageParams } from "../../shared/i18n/locale"
import type { ScholarlySearchStep } from "../../shared/scholarlySearchSchemas"
import { useTranslator } from "../lib/locale"
import { scholarMessages } from "../messages/scholar"

type ScholarTranslate = (key: keyof typeof scholarMessages.ko, params?: MessageParams) => string

const providerLabels: Readonly<Record<NonNullable<ScholarlySearchStep["provider"]>, string>> = {
  crossref: "Crossref",
  arxiv: "arXiv",
  openalex: "OpenAlex",
}

const providerErrorKinds = [
  "rate_limited",
  "timeout",
  "oversized",
  "cancelled",
  "network",
  "http_error",
  "malformed_response",
] as const

/** A provider failure in words; a kind without a label reads as written. */
export function providerErrorLabel(t: ScholarTranslate, kind: string): string {
  return (providerErrorKinds as readonly string[]).includes(kind)
    ? t(`scholar.error.${kind as (typeof providerErrorKinds)[number]}`)
    : kind
}

function stepLabel(step: ScholarlySearchStep, t: ScholarTranslate): string {
  switch (step.kind) {
    case "provider": {
      const name = step.provider ? providerLabels[step.provider] : t("scholar.step.search")
      const count = step.found ?? 0
      if (step.status === "running") return t("scholar.step.providerRunning", { name })
      if (step.status === "failed")
        return t("scholar.step.providerFailed", {
          name,
          error:
            step.detail === undefined
              ? t("scholar.step.error")
              : providerErrorLabel(t, step.detail),
        })
      return step.detail === "cached"
        ? t("scholar.step.providerDoneCached", { name, count })
        : t("scholar.step.providerDone", { name, count })
    }
    case "merge":
      if (step.status === "running") return t("scholar.step.mergeRunning")
      if (step.status === "failed") return t("scholar.step.mergeFailed")
      return t("scholar.step.mergeDone", { count: step.found ?? 0 })
    case "rank":
      if (step.status === "running") return t("scholar.step.rankRunning")
      if (step.status === "failed") return t("scholar.step.rankFailed")
      return t("scholar.step.rankDone", { count: step.found ?? 0 })
    case "judge":
      if (step.status === "running")
        return t("scholar.step.judgeRunning", { count: step.found ?? 0 })
      if (step.status === "failed") return step.detail ?? t("scholar.step.judgeFailed")
      return step.detail ?? t("scholar.step.judgeDone")
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
  const t = useTranslator(scholarMessages)
  return (
    <ol className="scholar-search-steps" aria-label={t("scholar.stepsLabel")}>
      {steps.map((step) => (
        <li key={step.id} className={`scholar-search-step scholar-search-step-${step.status}`}>
          <StepIcon status={step.status} />
          <span>{stepLabel(step, t)}</span>
        </li>
      ))}
    </ol>
  )
}
