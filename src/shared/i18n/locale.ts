import { z } from "zod"

/** The languages oh-my-paper speaks. The first one listed in a catalog is its source. */
export const LOCALES = ["ko", "en"] as const
export type Locale = (typeof LOCALES)[number]
export const localeSchema = z.enum(LOCALES)

/** `auto` follows the computer or browser; the others pin one language. */
export const languagePreferenceSchema = z.enum(["auto", ...LOCALES])
export type LanguagePreference = z.infer<typeof languagePreferenceSchema>

/** The language saved for the terminal and the app together. */
export const languageStatusSchema = z.object({ language: languagePreferenceSchema })

/** Used when nothing names a language the app speaks. */
export const FALLBACK_LOCALE: Locale = "en"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * The language named by the first usable tag, in order of preference: BCP 47 tags such as
 * `ko-KR` (browsers) or POSIX locales such as `ko_KR.UTF-8` (terminals). Empty values and the
 * `C`/`POSIX` locales carry no language and are skipped; the first real tag decides, falling
 * back to English when it names a language the app does not speak. Null when no tag is usable.
 */
export function localeFromTags(tags: readonly (string | null | undefined)[]): Locale | null {
  for (const raw of tags) {
    const tag = raw?.trim().toLowerCase()
    if (!tag) continue
    const base = tag.split(/[-_.@]/)[0] ?? ""
    if (base === "" || base === "c" || base === "posix") continue
    return isLocale(base) ? base : FALLBACK_LOCALE
  }
  return null
}

export type MessageParams = Readonly<Record<string, string | number>>

/** Fills `{name}` placeholders; an unknown placeholder is left as written. */
export function formatMessage(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

/** A catalog: the same keys in every language, the source language's wording in the type. */
export type Catalog<Source extends Readonly<Record<string, string>>> = Readonly<
  Record<Locale, Readonly<Record<keyof Source, string>>>
>

export function translator<Source extends Readonly<Record<string, string>>>(
  catalog: Catalog<Source>,
  locale: Locale,
): (key: keyof Source & string, params?: MessageParams) => string {
  const messages = catalog[locale]
  return (key, params) => formatMessage(messages[key], params)
}
