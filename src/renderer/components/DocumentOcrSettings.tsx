import type { JSX } from "react"
import { type DocumentOcrProviderStatus, formatOcrInstallProgress } from "../../shared/documentOcr"

const accelerationLabels: Readonly<
  Record<NonNullable<DocumentOcrProviderStatus["acceleration"]>, string>
> = {
  vllm: "GPU 가속 (vLLM)",
  mlx: "Apple 칩 가속 (MLX)",
}

function installProgress(status: DocumentOcrProviderStatus): string {
  return status.installProgress
    ? `설치 중 ${formatOcrInstallProgress(status.installProgress)}`
    : "설치 중"
}

function readiness(status: DocumentOcrProviderStatus): string {
  if (!status.configured) {
    return status.installing ? installProgress(status) : "로컬 런타임 설치 필요"
  }
  if (status.acceleration) return `${accelerationLabels[status.acceleration]} 준비됨`
  return "로컬 런타임 준비됨 · 가속 없음"
}

/**
 * The OCR engine for whoever looks: whether it is ready or still downloading, and how many papers
 * it has analysed. It works unseen everywhere else, so this is the one place that says so.
 */
export function DocumentOcrSettings({
  status,
  analysis,
}: {
  readonly status: DocumentOcrProviderStatus
  readonly analysis?: { readonly analysed: number; readonly total: number } | undefined
}): JSX.Element {
  return (
    <fieldset className="settings-group">
      <legend>로컬 PDF 분석</legend>
      <div className="settings-row">
        <span>
          <strong>{status.model}</strong>
          <small>
            {status.installing
              ? "설치가 끝나면 자동으로 켜집니다. 그동안에도 문서는 바로 읽을 수 있습니다."
              : "가져온 문서를 이 컴퓨터에서 분석합니다. 분석 중에도 바로 읽을 수 있습니다."}
          </small>
        </span>
        <strong>{readiness(status)}</strong>
        {status.installing && status.installProgress ? (
          <progress
            className="ocr-install-progress"
            max={100}
            value={status.installProgress.percent}
            aria-label="OCR 엔진 설치 진행률"
          />
        ) : null}
      </div>
      {analysis && analysis.total > 0 ? (
        <div className="settings-row">
          <span>
            <strong>정밀 분석</strong>
            <small>그림·표·수식과 원본 배치를 뒤에서 채웁니다. 읽는 논문부터 합니다.</small>
          </span>
          <strong>
            논문 {analysis.total}편 중 {analysis.analysed}편 완료
          </strong>
        </div>
      ) : null}
    </fieldset>
  )
}
