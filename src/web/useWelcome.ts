import { useCallback, useEffect, useState } from "react"
import { welcomeStatusSchema } from "../shared/welcome"
import { localRpc } from "./localTransport"
import { writeTipState } from "./tips/tipCatalog"

export type WelcomeState = "loading" | "pending" | "seen"

/**
 * The first-run welcome for this data folder: the intro page, then the 사용법 clips once. Where
 * the local server cannot answer, the welcome is skipped rather than blocking the app.
 */
export function useWelcome(): { readonly state: WelcomeState; readonly finish: () => void } {
  const [state, setState] = useState<WelcomeState>("loading")

  useEffect(() => {
    let cancelled = false
    localRpc("welcomeStatus", {}, welcomeStatusSchema).then(
      (status) => {
        if (!cancelled) setState(status.seen ? "seen" : "pending")
      },
      () => {
        if (!cancelled) setState("seen")
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const finish = useCallback(() => {
    setState("seen")
    // A fresh folder starts the feature tips over too; their record lives in this browser.
    writeTipState({ seen: [], off: false })
    void localRpc("markWelcomeSeen", {}, welcomeStatusSchema).catch(() => undefined)
  }, [])

  return { state, finish }
}
