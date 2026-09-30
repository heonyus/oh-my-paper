import { Check, Circle, LoaderCircle, TriangleAlert, X, XCircle } from "lucide-react"
import type { JSX } from "react"
import { type PreparationUpdate, preparationSteps } from "../../shared/ipc"
import { useTranslator } from "../lib/locale"
import { preparationStepLabels } from "../lib/preparationState"
import { libraryMessages } from "../messages/library"

type PreparationProgressProps = {
  readonly updates: readonly PreparationUpdate[]
  readonly onClose?: (() => void) | undefined
}

function StepIcon({
  state,
}: {
  readonly state: PreparationUpdate["state"] | "pending"
}): JSX.Element {
  switch (state) {
    case "active":
      return <LoaderCircle className="spin" size={14} aria-hidden="true" />
    case "complete":
      return <Check size={14} aria-hidden="true" />
    case "warning":
      return <TriangleAlert size={14} aria-hidden="true" />
    case "failed":
      return <XCircle size={14} aria-hidden="true" />
    case "pending":
      return <Circle size={12} aria-hidden="true" />
  }
}

export function PreparationProgress({ updates, onClose }: PreparationProgressProps): JSX.Element {
  const t = useTranslator(libraryMessages)
  const latest = updates.at(-1)
  return (
    <aside className="preparation-progress" aria-label={t("prep.label")}>
      <header>
        <strong>{t("prep.title")}</strong>
        <div>
          {onClose ? (
            <button type="button" aria-label={t("prep.close")} onClick={onClose}>
              <X size={14} />
            </button>
          ) : null}
        </div>
      </header>
      <ol>
        {preparationSteps.map((step) => {
          const update = updates.find((candidate) => candidate.step === step)
          const state = update?.state ?? "pending"
          return (
            <li key={step} data-state={state}>
              <StepIcon state={state} />
              <span data-state={state}>{t(preparationStepLabels[step])}</span>
            </li>
          )
        })}
      </ol>
      <p role="status" aria-live="polite">
        {latest?.message ?? t("prep.waiting")}
      </p>
    </aside>
  )
}
