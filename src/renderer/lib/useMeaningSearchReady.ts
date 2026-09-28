import { useEffect, useState } from "react"
import type { MeaningSearchState } from "../../shared/meaningSearch"

const POLL_MS = 2_000

/**
 * Starts the local meaning-search model when the note needs it and reports whether it is ready.
 * The first start downloads the model, so this can stay loading for a while.
 */
export function useMeaningSearchReady(active: boolean): MeaningSearchState | "unavailable" {
  const status = window.ohmypaper.meaningSearchStatus
  const [state, setState] = useState<MeaningSearchState | "unavailable">(
    status ? "idle" : "unavailable",
  )
  useEffect(() => {
    if (!active || !status) return
    let timer: number | undefined
    let stopped = false
    const check = async (prepare: boolean): Promise<void> => {
      try {
        const next = (await status(prepare)).state
        if (stopped) return
        setState(next)
        if (next === "loading") timer = window.setTimeout(() => void check(false), POLL_MS)
      } catch {
        if (!stopped) setState("failed")
      }
    }
    void check(true)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [active, status])
  return state
}
