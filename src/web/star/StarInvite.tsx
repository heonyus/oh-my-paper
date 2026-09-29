import { type JSX, useEffect, useMemo, useState } from "react"
import {
  GITHUB_REPO_URL,
  type GithubStarAnswer,
  githubStarStatusSchema,
} from "../../shared/githubStar"
import type { ReaderNote } from "../../shared/readerNote"
import type { DocumentRecord } from "../../shared/schemas"
import { localRpc } from "../localTransport"
import {
  activeDays,
  closedAs,
  readStarInviteState,
  type StarInviteState,
  shouldInvite,
  snoozed,
  writeStarInviteState,
} from "./starInviteRules"

const SHOW_DELAY_MS = 2500

async function readWizardAnswer(): Promise<GithubStarAnswer | null> {
  return (await localRpc("githubStarStatus", {}, githubStarStatusSchema)).answer
}

/**
 * One small, dismissible GitHub star invitation in the Library corner, shown only after real
 * local use. `active` is false while reading or while a dialog is open, which hides it.
 */
export function StarInvite({
  active,
  documents,
  readerNotes,
  loadWizardAnswer = readWizardAnswer,
}: {
  readonly active: boolean
  readonly documents: readonly Pick<DocumentRecord, "importedAt">[]
  readonly readerNotes: readonly Pick<ReaderNote, "markdown" | "updatedAt">[]
  readonly loadWizardAnswer?: () => Promise<GithubStarAnswer | null>
}): JSX.Element | null {
  const [wizardAnswer, setWizardAnswer] = useState<GithubStarAnswer | null | "loading">("loading")
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState(false)
  const days = useMemo(() => activeDays(documents, readerNotes), [documents, readerNotes])

  useEffect(() => {
    let cancelled = false
    loadWizardAnswer().then(
      (answer) => {
        if (!cancelled) setWizardAnswer(answer)
      },
      () => {
        // An older server without the answer only means the wizard's choice is unknown.
        if (!cancelled) setWizardAnswer(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [loadWizardAnswer])

  useEffect(() => {
    if (!active || shown || done || wizardAnswer === "loading") return
    const timer = window.setTimeout(() => {
      const state = readStarInviteState()
      const now = new Date()
      if (!shouldInvite({ activeDays: days, wizardAnswer, state, now })) return
      // Appearing starts the wait too, so a card left alone does not come back for a while.
      writeStarInviteState(snoozed(state, now))
      setShown(true)
    }, SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [active, shown, done, wizardAnswer, days])

  if (!active || !shown || done) return null

  const finish = (next: (state: StarInviteState) => StarInviteState): void => {
    writeStarInviteState(next(readStarInviteState()))
    setDone(true)
  }

  return (
    <aside className="star-invite" aria-labelledby="star-invite-title">
      <h2 id="star-invite-title">oh-my-paper가 도움이 되고 있나요?</h2>
      <p>GitHub에서 ⭐ 하나 남겨 주시면 계속 만들어 가는 데 큰 힘이 돼요.</p>
      <div className="star-invite-actions">
        <button
          type="button"
          className="star-invite-never"
          onClick={() => finish((state) => closedAs(state, "never"))}
        >
          다시 보지 않기
        </button>
        <button type="button" onClick={() => finish((state) => snoozed(state, new Date()))}>
          나중에
        </button>
        <a
          className="star-invite-star"
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => finish((state) => closedAs(state, "opened"))}
        >
          ⭐ 별 달기
        </a>
      </div>
    </aside>
  )
}
