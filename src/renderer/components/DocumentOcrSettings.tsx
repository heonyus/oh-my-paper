import type { JSX } from "react"
import { type DocumentOcrProviderStatus, formatOcrInstallProgress } from "../../shared/documentOcr"
import type { Locale } from "../../shared/i18n/locale"
import { useLocale, useTranslator } from "../lib/locale"
import { settingsMessages } from "../messages/settings"

type Translate = ReturnType<typeof useTranslator<(typeof settingsMessages)["ko"]>>

const accelerationLabels = {
  vllm: "settings.ocr.vllm",
  mlx: "settings.ocr.mlx",
} as const satisfies Readonly<
  Record<NonNullable<DocumentOcrProviderStatus["acceleration"]>, string>
>

function installProgress(status: DocumentOcrProviderStatus, t: Translate, locale: Locale): string {
  return status.installProgress
    ? t("settings.ocr.installingProgress", {
        progress: formatOcrInstallProgress(status.installProgress, locale),
      })
    : t("settings.ocr.installing")
}

function readiness(status: DocumentOcrProviderStatus, t: Translate, locale: Locale): string {
  if (!status.configured) {
    return status.installing ? installProgress(status, t, locale) : t("settings.ocr.installNeeded")
  }
  if (status.acceleration) {
    return t("settings.ocr.accelerated", {
      acceleration: t(accelerationLabels[status.acceleration]),
    })
  }
  return t("settings.ocr.noAcceleration")
}

/**
 * The OCR engine for whoever looks: whether it is ready or still downloading, and how many papers
 * it has analysed. It works unseen everywhere else, so this is the one place that says so.
 */
export function DocumentOcrSettings({
  status,
  analysis,
}: {
  readonly status: DocumentOcrProviderStatus
  readonly analysis?: { readonly analysed: number; readonly total: number } | undefined
}): JSX.Element {
  const t = useTranslator(settingsMessages)
  const { locale } = useLocale()
  return (
    <fieldset className="settings-group">
      <legend>{t("settings.ocr.title")}</legend>
      <div className="settings-row">
        <span>
          <strong>{status.model}</strong>
          <small>
            {status.installing ? t("settings.ocr.installingDetail") : t("settings.ocr.detail")}
          </small>
        </span>
        <strong>{readiness(status, t, locale)}</strong>
        {status.installing && status.installProgress ? (
          <progress
            className="ocr-install-progress"
            max={100}
            value={status.installProgress.percent}
            aria-label={t("settings.ocr.progress")}
          />
        ) : null}
      </div>
      {analysis && analysis.total > 0 ? (
        <div className="settings-row">
          <span>
            <strong>{t("settings.ocr.analysis")}</strong>
            <small>{t("settings.ocr.analysisDetail")}</small>
          </span>
          <strong>
            {t("settings.ocr.analysed", { total: analysis.total, analysed: analysis.analysed })}
          </strong>
        </div>
      ) : null}
    </fieldset>
  )
}
