import { spawnSync } from "node:child_process"
import {
  type Catalog,
  FALLBACK_LOCALE,
  type Locale,
  localeFromTags,
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
 * The terminal's language: `OH_MY_PAPER_LANG` when set, then the POSIX locale variables in
 * their order of precedence, then macOS's preferred languages; English when none is usable.
 */
export function detectCliLocale(
  env: NodeJS.ProcessEnv = process.env,
  systemLanguages: () => readonly string[] = macLanguages,
): Locale {
  return (
    localeFromTags([env["OH_MY_PAPER_LANG"], env["LC_ALL"], env["LC_MESSAGES"], env["LANG"]]) ??
    localeFromTags(systemLanguages()) ??
    FALLBACK_LOCALE
  )
}

export const cliLocale: Locale = detectCliLocale()

/** The CLI's wording for `catalog` in the terminal's language. */
export function cliTranslator<Source extends Readonly<Record<string, string>>>(
  catalog: Catalog<Source>,
): ReturnType<typeof translator<Source>> {
  return translator(catalog, cliLocale)
}
