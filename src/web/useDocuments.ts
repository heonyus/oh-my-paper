import { useCallback, useEffect, useState } from "react"
import { fetchDocuments, type WebDocument } from "./api"

export function useDocuments(enabled: boolean): {
  readonly documents: readonly WebDocument[]
  readonly loading: boolean
  readonly error: string | null
  readonly refresh: () => Promise<void>
} {
  const [documents, setDocuments] = useState<readonly WebDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setDocuments(await fetchDocuments())
      setError(null)
    } catch {
      setError("라이브러리를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => void refresh(), [refresh])
  useEffect(() => {
    if (
      !documents.some((document) => document.status === "queued" || document.status === "analyzing")
    )
      return
    const timer = window.setInterval(() => void refresh(), 2_000)
    return () => window.clearInterval(timer)
  }, [documents, refresh])
  return { documents, loading, error, refresh }
}
