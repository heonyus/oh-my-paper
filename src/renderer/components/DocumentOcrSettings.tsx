import type { JSX } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"

const accelerationLabels: Readonly<
  Record<NonNullable<DocumentOcrProviderStatus["acceleration"]>, string>
> = {
  vllm: "GPU 가속 (vLLM)",
  mlx: "Apple 칩 가속 (MLX)",
}

function readiness(status: DocumentOcrProviderStatus): string {
  if (!status.configured) {
    return status.installing ? "설치 중 · 끝나면 자동으로 켜집니다" : "로컬 런타임 설치 필요"
  }
  if (status.acceleration) return `${accelerationLabels[status.acceleration]} 준비됨`
  return "로컬 런타임 준비됨 · 가속 없음"
}

export function DocumentOcrSettings({
  status,
}: {
  readonly status: DocumentOcrProviderStatus
}): JSX.Element {
  return (
    <fieldset className="settings-group">
      <legend>로컬 PDF 분석</legend>
      <div className="settings-row">
        <span>
          <strong>{status.model}</strong>
          <small>가져온 문서를 이 컴퓨터에서 분석합니다. 분석 중에도 바로 읽을 수 있습니다.</small>
        </span>
        <strong>{readiness(status)}</strong>
      </div>
    </fieldset>
  )
}
