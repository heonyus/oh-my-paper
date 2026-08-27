import { X } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import type { ProviderConfig, ProviderStatus } from "../../shared/ipc"

type SettingsModalProps = {
  readonly status: ProviderStatus
  readonly onClose: () => void
  readonly onSave: (config: ProviderConfig) => Promise<void>
}

export function SettingsModal({ status, onClose, onSave }: SettingsModalProps): JSX.Element {
  const [provider, setProvider] = useState<ProviderConfig["provider"]>(status.provider)
  const [model, setModel] = useState(status.model)
  const [key, setKey] = useState("")
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      await onSave({ provider, model, apiKey: key })
      setKey("")
      setMessage("키가 Electron safeStorage를 통해 암호화되어 보관되었습니다.")
    } catch {
      setMessage("키를 저장하지 못했습니다. 형식과 운영체제 보안 저장소를 확인하세요.")
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <h2 id="settings-title">AI 설정</h2>
          <button type="button" aria-label="설정 닫기" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <p>
          AI 기능은 사용자가 번역·설명·시각화를 직접 실행할 때만 선택 구절과 최소 주변 문맥을
          전송합니다.
        </p>
        <dl>
          <div>
            <dt>상태</dt>
            <dd>{status.configured ? "연결 준비됨" : "API 키 필요"}</dd>
          </div>
          <div>
            <dt>기본 모델</dt>
            <dd>{model}</dd>
          </div>
        </dl>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="ai-provider">Provider</label>
          <select
            id="ai-provider"
            value={provider}
            onChange={(event) => {
              const next = event.currentTarget.value
              if (next !== "openai" && next !== "openrouter") return
              setProvider(next)
              setModel(next === "openai" ? "gpt-5" : "openai/gpt-5")
            }}
          >
            <option value="openai">OpenAI API</option>
            <option value="openrouter">OpenRouter</option>
          </select>
          <label htmlFor="provider-model">모델 ID</label>
          <input
            id="provider-model"
            type="text"
            value={model}
            onChange={(event) => setModel(event.currentTarget.value)}
          />
          <label htmlFor="provider-key">API 키</label>
          <input
            id="provider-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.currentTarget.value)}
            placeholder={provider === "openrouter" ? "sk-or-…" : "sk-…"}
          />
          <button className="primary-action" type="submit">
            암호화하여 저장
          </button>
        </form>
        <p className="settings-note">
          ChatGPT Plus/Pro 구독은 API 사용권이 아니므로 이 앱에 OAuth 모델 호출로 연결되지 않습니다.
        </p>
        {message ? <p role="status">{message}</p> : null}
      </section>
    </div>
  )
}
