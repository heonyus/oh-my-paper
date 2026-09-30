import { Check } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import {
  GEMINI_WEB_MODEL,
  GROQ_WEB_MODELS,
  type HostedCredentialProvider,
  type HostedCredentialSave,
  type HostedCredentialStatus,
} from "../../shared/webCredentials"
import { useTranslator } from "../lib/locale"
import { settingsMessages } from "../messages/settings"

const sourceLabels = {
  personal: "settings.hosted.personal",
  shared: "settings.hosted.shared",
  missing: "settings.hosted.missing",
} as const satisfies Readonly<Record<"personal" | "shared" | "missing", string>>

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
  const t = useTranslator(settingsMessages)
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
      setMessage(t("settings.ai.saved"))
    } catch (error) {
      if (!(error instanceof Error)) throw error
      setMessage(t("settings.ai.saveFailed"))
    }
  }

  return (
    <form className="hosted-credential" onSubmit={(event) => void submit(event)}>
      <div className="hosted-credential-head">
        <strong>{label}</strong>
        <span data-source={status.source}>
          {t(sourceLabels[status.source])}
          {preferred ? ` · ${t("settings.hosted.default")}` : ""}
        </span>
      </div>
      <label>
        <span>{t("settings.ai.apiKey")}</span>
        <input
          type="password"
          aria-label={t("settings.hosted.apiKeyLabel", { provider: label })}
          autoComplete="off"
          value={apiKey}
          placeholder={t("settings.hosted.newKey")}
          onChange={(event) => setApiKey(event.currentTarget.value)}
        />
      </label>
      {provider === "groq" ? (
        <label>
          <span>{t("settings.ai.model")}</span>
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
          {t("settings.hosted.save", { provider: label })}
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
