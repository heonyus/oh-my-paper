import { useCallback, useEffect, useState } from "react"
import type { HostedCredentialSave, HostedCredentialStatus } from "../shared/webCredentials"
import { fetchHostedCredentialStatus, saveHostedCredential } from "./api"

export function useHostedCredentials(): {
  readonly status: HostedCredentialStatus
  readonly error: string | null
  readonly save: (credential: HostedCredentialSave) => Promise<void>
} {
  const [status, setStatus] = useState<HostedCredentialStatus>({
    providers: {
      gemini: { source: "missing", model: "gemini-3.5-flash-lite" },
      groq: { source: "missing", model: "openai/gpt-oss-20b" },
      mistral: { source: "missing", model: "mistral-ocr-4-1" },
    },
    preferredTextProvider: "gemini",
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetchHostedCredentialStatus().then(
      (value) => {
        if (active) {
          setStatus(value)
          setError(null)
        }
      },
      (reason: unknown) => {
        if (!(reason instanceof Error)) throw reason
        if (active) setError("키 상태를 불러오지 못했습니다.")
      },
    )
    return () => {
      active = false
    }
  }, [])

  const save = useCallback(async (credential: HostedCredentialSave): Promise<void> => {
    setStatus(await saveHostedCredential(credential))
    setError(null)
  }, [])

  return { status, error, save }
}
