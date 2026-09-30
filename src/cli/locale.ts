import { spawnSync } from "node:child_process"
import { webDataDir } from "../server/config"
import { readSavedLanguage } from "../server/languageStore"
import {
  type Catalog,
  FALLBACK_LOCALE,
  type Locale,
  localeFromTags,
  type MessageParams,
  translator,
} from "../shared/i18n/locale"

/** macOS's preferred languages, most preferred first, for a terminal that sets no LANG. */
function macLanguages(): string[] {
  if (process.platform !== "darwin") return []
  const result = spawnSync("defaults", ["read", "-g", "AppleLanguages"], {
    encoding: "utf8",
    timeout: 2_000,
  })
  return (result.stdout ?? "").match(/[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*/g) ?? []
}

/**
 * The terminal's language: `OH_MY_PAPER_LANG` when set, then the language the person picked
 * (`saved`), then the POSIX locale variables in their order of precedence, then macOS's preferred
 * languages; English when none is usable.
 */
export function detectCliLocale(
  env: NodeJS.ProcessEnv = process.env,
  systemLanguages: () => readonly string[] = macLanguages,
  saved: Locale | null = null,
): Locale {
  return (
    localeFromTags([env["OH_MY_PAPER_LANG"]]) ??
    saved ??
    localeFromTags([env["LC_ALL"], env["LC_MESSAGES"], env["LANG"]]) ??
    localeFromTags(systemLanguages()) ??
    FALLBACK_LOCALE
  )
}

let active: Locale = detectCliLocale(process.env, macLanguages, readSavedLanguage(webDataDir()))

/** The language the CLI speaks right now. */
export function cliLocale(): Locale {
  return active
}

/** Switches the CLI's wording once the person picks a language. */
export function setCliLocale(locale: Locale): void {
  active = locale
}

/** The CLI's wording for `catalog`, in whichever language is active when a line is printed. */
export function cliTranslator<Source extends Readonly<Record<string, string>>>(
  catalog: Catalog<Source>,
): (key: keyof Source & string, params?: MessageParams) => string {
  const byLocale = { ko: translator(catalog, "ko"), en: translator(catalog, "en") }
  return (key, params) => byLocale[active](key, params)
}
