import { useEffect, useMemo, useRef, useState } from "react"
import {
  buildDeterministicWritingSuggestions,
  LOCAL_INFERENCE_LIMITS,
  type LocalInferenceApi,
  type LocalInferenceSuggestResult,
} from "../../shared/localInference"
import { researchMessages } from "../messages/research"
import { useTranslator } from "./locale"

export type UseLocalSuggestionsOptions = {
  readonly api: LocalInferenceApi | null
  readonly nodeTitle: string
  readonly draft: string
  readonly enabled: boolean
  readonly imeComposing: boolean
  readonly cursorAtEnd?: boolean | undefined
}

export type UseLocalSuggestionsResult = {
  readonly suggestions: readonly string[]
  readonly deterministicSuggestions: readonly string[]
  readonly localSuggestions: readonly string[]
  readonly pending: boolean
  readonly error: string | null
  readonly revision: number
}

export function useLocalSuggestions(
  options: UseLocalSuggestionsOptions,
): UseLocalSuggestionsResult {
  const deterministicSuggestions = useMemo(
    () => buildDeterministicWritingSuggestions({ title: options.nodeTitle, body: options.draft }),
    [options.nodeTitle, options.draft],
  )
  const revisionRef = useRef(0)
  const inputRef = useRef<{ readonly nodeTitle: string; readonly draft: string } | null>(null)
  const [revision, setRevision] = useState(0)
  const [localSuggestions, setLocalSuggestions] = useState<readonly string[]>([])
  const [pending, setPending] = useState(false)
  // A catalog key, so the message follows the app's language without re-running the request.
  const [error, setError] = useState<"suggestions.unavailable" | "suggestions.failed" | null>(null)
  const t = useTranslator(researchMessages)
  const cursorAtEnd = options.cursorAtEnd ?? true

  useEffect(() => {
    if (
      inputRef.current?.nodeTitle === options.nodeTitle &&
      inputRef.current?.draft === options.draft
    ) {
      return
    }
    inputRef.current = { nodeTitle: options.nodeTitle, draft: options.draft }
    revisionRef.current += 1
    setRevision(revisionRef.current)
    setLocalSuggestions([])
    setError(null)
  }, [options.draft, options.nodeTitle])

  useEffect(() => {
    if (options.api === null || !options.enabled || options.imeComposing || !cursorAtEnd) {
      setPending(false)
      setLocalSuggestions([])
      return
    }

    let disposed = false
    let requestId: string | null = null
    const timeout = setTimeout(() => {
      void requestSuggestions()
    }, LOCAL_INFERENCE_LIMITS.debounceMs)

    return () => {
      disposed = true
      clearTimeout(timeout)
      if (requestId !== null) void options.api?.cancel(requestId)
    }

    async function requestSuggestions(): Promise<void> {
      setPending(true)
      try {
        const status = await options.api?.getStatus()
        if (
          disposed ||
          status === undefined ||
          !status.enabled ||
          !status.device.supported ||
          status.setup.status !== "ready"
        ) {
          setPending(false)
          return
        }
        requestId = crypto.randomUUID()
        const result = await options.api?.suggest({
          requestId,
          revision: revisionRef.current,
          nodeTitle: options.nodeTitle,
          draft: options.draft,
        })
        if (disposed || result === undefined || result.revision !== revisionRef.current) return
        applyResult(result)
      } catch (_error) {
        if (!disposed) setError("suggestions.unavailable")
      } finally {
        if (!disposed) setPending(false)
      }
    }

    function applyResult(result: LocalInferenceSuggestResult): void {
      if (result.status === "ready") {
        setLocalSuggestions(result.suggestions)
        setError(null)
      } else if (result.status === "unavailable" && result.reason === "execution_failed") {
        setError("suggestions.failed")
      }
    }
  }, [
    options.api,
    cursorAtEnd,
    options.draft,
    options.enabled,
    options.imeComposing,
    options.nodeTitle,
  ])

  return {
    suggestions: [...deterministicSuggestions, ...localSuggestions],
    deterministicSuggestions,
    localSuggestions,
    pending,
    error: error === null ? null : t(error),
    revision,
  }
}
