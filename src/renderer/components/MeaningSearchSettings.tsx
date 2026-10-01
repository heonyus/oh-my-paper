import { type JSX, useCallback, useEffect, useState } from "react"
import type { MeaningSearchStatus } from "../../shared/meaningSearch"
import { useTranslator } from "../lib/locale"
import { settingsMessages } from "../messages/settings"

const POLL_MS = 2_000

/**
 * The note's local source-matching model, for whoever looks: the app fetches it in the background
 * at start, so this only says whether it is ready, how far the download is, or that it failed.
 */
export function MeaningSearchSettings(): JSX.Element | null {
  const t = useTranslator(settingsMessages)
  const api = window.ohmypaper?.meaningSearchStatus
  const [status, setStatus] = useState<MeaningSearchStatus | null>(null)
  const check = useCallback(
    async (prepare: boolean): Promise<void> => {
      if (!api) return
      try {
        setStatus(await api(prepare))
      } catch {
        setStatus({ state: "failed" })
      }
    },
    [api],
  )

  useEffect(() => {
    void check(false)
  }, [check])
  useEffect(() => {
    if (status?.state !== "loading") return
    const timer = window.setTimeout(() => void check(false), POLL_MS)
    return () => window.clearTimeout(timer)
  }, [status, check])

  if (!api) return null
  const state = status?.state ?? "idle"
  const label =
    state === "ready"
      ? t("settings.meaning.ready")
      : state === "failed"
        ? t("settings.meaning.failed")
        : state === "loading"
          ? status?.progress !== undefined
            ? t("settings.meaning.loadingProgress", { progress: status.progress })
            : t("settings.meaning.loading")
          : t("settings.meaning.idle")
  return (
    <fieldset className="settings-group">
      <legend>{t("settings.meaning.title")}</legend>
      <div className="settings-row">
        <span>
          <strong>EmbeddingGemma-300M</strong>
          <small>{t("settings.meaning.detail")}</small>
        </span>
        <strong role="status">{label}</strong>
        {state === "loading" && status?.progress !== undefined ? (
          <progress
            className="ocr-install-progress"
            max={100}
            value={status.progress}
            aria-label={t("settings.meaning.progress")}
          />
        ) : null}
        {state === "failed" || state === "idle" ? (
          <button type="button" onClick={() => void check(true)}>
            {t(state === "failed" ? "settings.meaning.retry" : "settings.meaning.start")}
          </button>
        ) : null}
      </div>
    </fieldset>
  )
}
