import { Check, Circle, LoaderCircle, TriangleAlert, X, XCircle } from "lucide-react"
import type { JSX } from "react"
import { type PreparationUpdate, preparationSteps } from "../../shared/ipc"

type PreparationProgressProps = {
  readonly updates: readonly PreparationUpdate[]
  readonly onClose?: (() => void) | undefined
}

const labels: Readonly<Record<PreparationUpdate["step"], string>> = {
  pdf_check: "PDF 확인",
  register: "문서 등록",
  layout: "페이지 구성",
  text_extract: "텍스트 추출",
  anchors: "앵커 생성",
  metadata: "메타정보",
  quality: "품질 검사",
  ready: "보드 준비 완료",
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
  const latest = updates.at(-1)
  return (
    <aside className="preparation-progress" aria-label="PDF 로컬 준비 진행">
      <header>
        <strong>논문을 보드에 준비하는 중</strong>
        <div>
          {onClose ? (
            <button type="button" aria-label="준비 상태 닫기" onClick={onClose}>
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
              <span data-state={state}>{labels[step]}</span>
            </li>
          )
        })}
      </ol>
      <p role="status" aria-live="polite">
        {latest?.message ?? "준비 대기"}
      </p>
    </aside>
  )
}
