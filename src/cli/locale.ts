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

const LANGUAGE_TAG = /[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*/g

/** macOS's preferred languages, most preferred first, for a terminal that sets no LANG. */
function macLanguages(): string[] {
  const result = spawnSync("defaults", ["read", "-g", "AppleLanguages"], {
    encoding: "utf8",
    timeout: 2_000,
  })
  return (result.stdout ?? "").match(LANGUAGE_TAG) ?? []
}

/**
 * The languages `reg query` lists for Windows' preferred languages (Settings → Time & language),
 * most preferred first; `reg` prints the list as one line joined by a literal `\0`.
 */
export function parseWindowsLanguages(output: string): string[] {
  const listed = /\bLanguages\s+REG_MULTI_SZ\s+(.+)/.exec(output)?.[1] ?? ""
  return listed
    .split("\\0")
    .flatMap((part) => part.trim().match(LANGUAGE_TAG) ?? [])
    .filter(Boolean)
}

/**
 * Windows' preferred languages, for a terminal that sets no LANG (Windows never does), then the
 * locale Node takes from Windows when none are listed.
 */
function windowsLanguages(): string[] {
  const result = spawnSync(
    "reg",
    ["query", "HKCU\\Control Panel\\International\\User Profile", "/v", "Languages"],
    { encoding: "utf8", timeout: 2_000, windowsHide: true },
  )
  const listed = parseWindowsLanguages(result.stdout ?? "")
  return listed.length > 0 ? listed : [Intl.DateTimeFormat().resolvedOptions().locale]
}

/** The computer's own preferred languages, most preferred first. */
function systemLanguages(): string[] {
  if (process.platform === "darwin") return macLanguages()
  if (process.platform === "win32") return windowsLanguages()
  return []
}

/**
 * The terminal's language: `OH_MY_PAPER_LANG` when set, then the language the person picked
 * (`saved`), then the POSIX locale variables in their order of precedence, then the computer's
 * preferred languages (macOS's, or Windows'); English when none is usable.
 */
export function detectCliLocale(
  env: NodeJS.ProcessEnv = process.env,
  preferredLanguages: () => readonly string[] = systemLanguages,
  saved: Locale | null = null,
): Locale {
  return (
    localeFromTags([env["OH_MY_PAPER_LANG"]]) ??
    saved ??
    localeFromTags([env["LC_ALL"], env["LC_MESSAGES"], env["LANG"]]) ??
    localeFromTags(preferredLanguages()) ??
    FALLBACK_LOCALE
  )
}

let active: Locale = detectCliLocale(process.env, systemLanguages, readSavedLanguage(webDataDir()))

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
