import type { JSX } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"

export function DocumentOcrSettings({
  status,
}: {
  readonly status: DocumentOcrProviderStatus
}): JSX.Element {
  return (
    <div className="settings-ai-stack">
      <fieldset className="settings-group">
        <legend>로컬 PDF 분석</legend>
        <div className="settings-row">
          <span>
            <strong>{status.model}</strong>
            <small>가져온 문서를 먼저 분석하고 검사합니다.</small>
          </span>
          <strong>{status.configured ? "로컬 런타임 준비됨" : "로컬 런타임 설치 필요"}</strong>
        </div>
      </fieldset>
    </div>
  )
}
