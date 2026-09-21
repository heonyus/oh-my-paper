import { Check } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import {
  GEMINI_WEB_MODEL,
  GROQ_WEB_MODELS,
  type HostedCredentialProvider,
  type HostedCredentialSave,
  type HostedCredentialStatus,
} from "../../shared/webCredentials"

function sourceLabel(source: "personal" | "shared" | "missing"): string {
  if (source === "personal") return "내 키 연결됨"
  if (source === "shared") return "공용 키 사용 중"
  return "키 필요"
}

function CredentialForm({
  provider,
  label,
  status,
  preferred,
  onSave,
}: {
  readonly provider: HostedCredentialProvider
  readonly label: string
  readonly status: HostedCredentialStatus["providers"][HostedCredentialProvider]
  readonly preferred: boolean
  readonly onSave: (credential: HostedCredentialSave) => Promise<void>
}): JSX.Element {
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState(status.model)
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    try {
      if (provider === "gemini") {
        await onSave({ provider, apiKey, model: model || GEMINI_WEB_MODEL })
      } else {
        const selectedModel = GROQ_WEB_MODELS.find((item) => item === model)
        if (!selectedModel) return
        await onSave({ provider, apiKey, model: selectedModel })
      }
      setApiKey("")
      setMessage("저장됨")
    } catch (error) {
      if (!(error instanceof Error)) throw error
      setMessage("저장 실패")
    }
  }

  return (
    <form className="hosted-credential" onSubmit={(event) => void submit(event)}>
      <div className="hosted-credential-head">
        <strong>{label}</strong>
        <span data-source={status.source}>
          {sourceLabel(status.source)}
          {preferred ? " · 기본" : ""}
        </span>
      </div>
      <label>
        <span>API 키</span>
        <input
          type="password"
          aria-label={`${label} API 키`}
          autoComplete="off"
          value={apiKey}
          placeholder="새 키 입력"
          onChange={(event) => setApiKey(event.currentTarget.value)}
        />
      </label>
      {provider === "groq" ? (
        <label>
          <span>모델</span>
          <select value={model} onChange={(event) => setModel(event.currentTarget.value)}>
            {GROQ_WEB_MODELS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>{GEMINI_WEB_MODEL}</p>
      )}
      <footer>
        <span role="status">
          {message ? (
            <>
              <Check size={13} /> {message}
            </>
          ) : null}
        </span>
        <button type="submit" disabled={apiKey.trim().length < 20}>
          {`${label} 저장하고 기본으로 사용`}
        </button>
      </footer>
    </form>
  )
}

export type HostedCredentialSettingsProps = {
  readonly status: HostedCredentialStatus
  readonly error?: string | null | undefined
  readonly onSave: (credential: HostedCredentialSave) => Promise<void>
}

export function HostedCredentialSettings({
  status,
  error = null,
  onSave,
}: HostedCredentialSettingsProps): JSX.Element {
  return (
    <div className="hosted-credential-stack">
      {error ? (
        <p className="hosted-credential-error" role="alert">
          {error}
        </p>
      ) : null}
      <CredentialForm
        provider="gemini"
        label="Gemini"
        status={status.providers.gemini}
        preferred={status.preferredTextProvider === "gemini"}
        onSave={onSave}
      />
      <CredentialForm
        provider="groq"
        label="Groq"
        status={status.providers.groq}
        preferred={status.preferredTextProvider === "groq"}
        onSave={onSave}
      />
    </div>
  )
}
