import { type JSX, useCallback, useEffect, useState } from "react"
import {
  LOCAL_INFERENCE_CANDIDATE,
  type LocalInferenceApi,
  type LocalInferenceSetupCheck,
  type LocalInferenceStatus,
} from "../../../shared/localInference"
import { useLocalSuggestions } from "../../lib/useLocalSuggestions"
import "./local-ai.css"

export type LocalAiPanelProps = {
  readonly api: LocalInferenceApi | null
  readonly nodeTitle: string
  readonly draft: string
  readonly imeComposing: boolean
  readonly onInsertSuggestion?: (suggestion: string) => void
  readonly showSuggestions?: boolean
  readonly runSuggestions?: boolean
}

type BusyState = "idle" | "status" | "setup" | "enable"

export function LocalAiPanel(props: LocalAiPanelProps): JSX.Element {
  const [status, setStatus] = useState<LocalInferenceStatus | null>(null)
  const [busy, setBusy] = useState<BusyState>("idle")
  const [error, setError] = useState<string | null>(null)
  const suggestions = useLocalSuggestions({
    api: props.api,
    nodeTitle: props.nodeTitle,
    draft: props.draft,
    enabled: props.runSuggestions !== false && (status?.enabled ?? false),
    imeComposing: props.imeComposing,
  })

  const refresh = useCallback(async (): Promise<void> => {
    if (props.api === null) {
      setStatus(null)
      return
    }
    setBusy("status")
    try {
      setStatus(await props.api.getStatus())
      setError(null)
    } catch (_error) {
      setError("로컬 제안 상태를 확인하지 못했습니다.")
    } finally {
      setBusy("idle")
    }
  }, [props.api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function chooseSetup(): Promise<void> {
    if (props.api === null) return
    setBusy("setup")
    setError(null)
    try {
      await props.api.chooseSetup()
      await refresh()
    } catch (_error) {
      setError("선택한 로컬 파일을 검증하지 못했습니다.")
      setBusy("idle")
    }
  }

  async function toggleEnabled(): Promise<void> {
    if (props.api === null) return
    setBusy("enable")
    setError(null)
    try {
      setStatus(await props.api.enable(!(status?.enabled ?? false)))
    } catch (_error) {
      setError("로컬 제안 설정을 변경하지 못했습니다.")
    } finally {
      setBusy("idle")
    }
  }

  return (
    <section className="local-ai" aria-labelledby="local-ai-title">
      <header className="local-ai__header">
        <div>
          <p className="local-ai__eyebrow">선택 사항 · 기기 안에서만</p>
          <h2 id="local-ai-title">로컬 글쓰기 제안</h2>
        </div>
      </header>

      <p className="local-ai__intro">
        로컬 모델을 켜지 않아도 결정적 제안은 계속 표시됩니다. 문서와 제안은 클라우드로 보내지지
        않습니다.
      </p>

      <div className="local-ai__status" aria-live="polite">
        <StatusSummary api={props.api} status={status} />
        {status ? <p>{deviceMessage(status)}</p> : null}
        {status ? <p>{setupMessage(status.setup)}</p> : null}
      </div>

      <div className="local-ai__facts">
        <p>
          후보 런타임: {LOCAL_INFERENCE_CANDIDATE.runtime.name}{" "}
          {LOCAL_INFERENCE_CANDIDATE.runtime.version}
        </p>
        <p>후보 모델: {LOCAL_INFERENCE_CANDIDATE.model.name}</p>
        <p>라이선스: {LOCAL_INFERENCE_CANDIDATE.model.license} 확인 필요</p>
      </div>

      {error ? (
        <p className="local-ai__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="local-ai__actions">
        <button
          type="button"
          disabled={props.api === null || busy !== "idle"}
          onClick={() => void chooseSetup()}
        >
          {busy === "setup" ? "검증 중…" : "로컬 파일 선택·검증"}
        </button>
        <button
          type="button"
          className="local-ai__secondary"
          disabled={props.api === null || busy !== "idle"}
          onClick={() => void toggleEnabled()}
        >
          {busy === "enable" ? "변경 중…" : status?.enabled ? "로컬 제안 끄기" : "로컬 제안 켜기"}
        </button>
      </div>

      <p className="local-ai__download-note">
        자동 다운로드·시작을 하지 않습니다. 공식 파일을 직접 준비하고 SHA-256과 라이선스를 확인한
        설정 매니페스트만 사용합니다.
      </p>

      {props.showSuggestions !== false ? (
        <div className="local-ai__suggestions" aria-live="polite">
          <div className="local-ai__suggestion-heading">
            <h3>제안</h3>
            {suggestions.pending ? <span>로컬 모델 응답 대기 중…</span> : null}
          </div>
          {suggestions.error ? <p className="local-ai__error">{suggestions.error}</p> : null}
          <ul>
            {suggestions.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button type="button" onClick={() => props.onInsertSuggestion?.(suggestion)}>
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function StatusSummary({
  api,
  status,
}: {
  readonly api: LocalInferenceApi | null
  readonly status: LocalInferenceStatus | null
}): JSX.Element {
  if (api === null) return <p>이 빌드에서는 로컬 추론 API가 연결되지 않았습니다.</p>
  if (status === null) return <p>로컬 제안 상태 확인 중…</p>
  if (!status.device.supported) return <p>현재 기기에서는 지원되지 않습니다.</p>
  if (!status.enabled) return <p>로컬 제안은 꺼져 있습니다.</p>
  if (status.setup.status !== "ready") return <p>로컬 제안은 켜졌지만 설정이 필요합니다.</p>
  return <p>로컬 제안이 준비되었습니다.</p>
}

function deviceMessage(status: LocalInferenceStatus): string {
  return `기기: ${status.device.platform}/${status.device.arch} · ${status.device.supported ? "지원됨" : "미지원"}`
}

function setupMessage(setup: LocalInferenceSetupCheck): string {
  if (setup.status === "ready") return "런타임·모델 해시와 라이선스가 검증되었습니다."
  switch (setup.reason) {
    case "disabled":
      return "사용자가 로컬 제안을 껐습니다."
    case "unsupported_device":
      return "Apple Silicon macOS에서만 이 후보 경로를 사용할 수 있습니다."
    case "setup_required":
      return "llama.cpp 서버 실행 파일과 Qwen GGUF 파일을 직접 선택하세요."
    case "license_required":
      return "Apache-2.0 라이선스를 확인한 뒤 설정을 다시 선택하세요."
    case "runtime_missing":
      return "선택한 llama.cpp 서버 실행 파일을 찾을 수 없습니다."
    case "runtime_archive_missing":
      return "선택한 llama.cpp 압축 파일을 찾을 수 없습니다."
    case "runtime_archive_hash_mismatch":
      return "llama.cpp 압축 파일 SHA-256이 공식 핀과 다릅니다."
    case "runtime_executable_hash_mismatch":
      return "선택한 llama.cpp 실행 파일이 공식 압축 파일의 실행 파일과 다릅니다."
    case "model_revision_mismatch":
      return "Qwen GGUF revision이 공식 핀과 다릅니다."
    case "model_missing":
      return "선택한 Qwen GGUF 모델을 찾을 수 없습니다."
    case "model_hash_mismatch":
      return "Qwen GGUF 모델 SHA-256이 공식 핀과 다릅니다."
    case "execution_failed":
      return "로컬 런타임을 실행할 수 없습니다."
    case "cancelled":
      return "로컬 제안 요청이 취소되었습니다."
    default:
      return assertNever(setup.reason)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected local inference state: ${String(value)}`)
}
