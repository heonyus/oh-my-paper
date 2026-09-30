import { isCancel, log, select } from "@clack/prompts"
import type { WebServerConfig } from "../server/config"
import { saveLanguage } from "../server/languageStore"
import { type Locale, languagePreferenceSchema } from "../shared/i18n/locale"
import { cliLocale, detectCliLocale, setCliLocale } from "./locale"
import { t } from "./messages"

/**
 * Asks which language the terminal and the app speak, starting on the detected one, and keeps the
 * answer for both. False when the person cancels.
 */
export async function chooseLanguage(config: WebServerConfig): Promise<boolean> {
  const choice = await select<Locale>({
    message: t("language.ask"),
    options: [
      { value: "ko", label: "한국어" },
      { value: "en", label: "English" },
    ],
    initialValue: cliLocale(),
  })
  if (isCancel(choice)) return false
  await saveLanguage(config.dataDir, choice)
  setCliLocale(choice)
  return true
}

/** `oh-my-paper language [ko|en|auto]`: asks without a value, or keeps the one given. */
export async function languageCommand(config: WebServerConfig, value?: string): Promise<void> {
  if (value === undefined) {
    if (await chooseLanguage(config)) log.success(t("language.saved"))
    return
  }
  const parsed = languagePreferenceSchema.safeParse(value.trim().toLowerCase())
  if (!parsed.success) {
    process.stderr.write(`${t("language.unknown", { value })}\n`)
    process.exitCode = 1
    return
  }
  await saveLanguage(config.dataDir, parsed.data)
  setCliLocale(parsed.data === "auto" ? detectCliLocale() : parsed.data)
  log.success(parsed.data === "auto" ? t("language.auto") : t("language.saved"))
}
