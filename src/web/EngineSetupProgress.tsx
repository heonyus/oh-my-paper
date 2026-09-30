import { Check } from "lucide-react"
import { type JSX, useEffect, useState } from "react"
import { type DocumentOcrProviderStatus, formatOcrInstallProgress } from "../shared/documentOcr"

/**
 * The OCR engine's background download, for the first-run page and the 사용법 clips: a bar while
 * it runs, then one "ready" line once it finishes in front of the person. Nothing when no install
 * was running.
 */
export function EngineSetupProgress({
  status,
}: {
  readonly status: DocumentOcrProviderStatus
}): JSX.Element | null {
  const installing = status.installing === true
  const [followed, setFollowed] = useState(installing)
  useEffect(() => {
    if (installing) setFollowed(true)
  }, [installing])

  if (installing) {
    const progress = status.installProgress
    return (
      <div className="engine-setup" role="status">
        <div className="engine-setup-head">
          <strong>문서 분석 엔진 내려받는 중</strong>
          <span>{formatOcrInstallProgress(progress ?? null)}</span>
        </div>
        <progress max={100} value={progress?.percent} aria-label="문서 분석 엔진 내려받기 진행률" />
        <small>
          스캔 PDF와 그림·표·수식을 이 컴퓨터에서 읽는 엔진입니다. 끝나면 자동으로 켜집니다.
        </small>
      </div>
    )
  }
  if (followed && status.configured) {
    return (
      <div className="engine-setup engine-setup-ready" role="status">
        <div className="engine-setup-head">
          <strong>
            <Check size={15} strokeWidth={2.6} aria-hidden="true" /> 문서 분석 엔진 준비 완료
          </strong>
        </div>
      </div>
    )
  }
  return null
}
