import type { Locale } from "./i18n/locale"
import { type AppearanceTheme, appearanceThemeSchema, type UiFontFamily } from "./schemas"

export const uiFontOptions = [
  { value: "wanted", label: { ko: "Wanted Sans", en: "Wanted Sans" } },
  { value: "pretendard", label: { ko: "Pretendard", en: "Pretendard" } },
  { value: "suit", label: { ko: "SUIT", en: "SUIT" } },
  {
    value: "geist-wanted",
    label: { ko: "Geist 영문 + Wanted Sans 한글", en: "Geist for Latin + Wanted Sans for Korean" },
  },
  { value: "system", label: { ko: "시스템 글꼴", en: "System font" } },
] as const satisfies readonly {
  readonly value: UiFontFamily
  readonly label: Readonly<Record<Locale, string>>
}[]

export const uiFontScalePresets = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** Every selectable theme, in the order the appearance pickers list them. */
export const appearanceThemes = appearanceThemeSchema.options

export function isAppearanceTheme(value: string): value is AppearanceTheme {
  return appearanceThemeSchema.safeParse(value).success
}

const appearanceThemeLabels = {
  system: { ko: "시스템 설정", en: "System setting" },
  light: { ko: "라이트", en: "Light" },
  dark: { ko: "다크", en: "Dark" },
  dracula: { ko: "드라큘라", en: "Dracula" },
  "tokyo-night-light": { ko: "도쿄 나이트 라이트", en: "Tokyo Night Light" },
} as const satisfies Readonly<Record<AppearanceTheme, Readonly<Record<Locale, string>>>>

export function appearanceThemeLabel(theme: AppearanceTheme, locale: Locale = "ko"): string {
  return appearanceThemeLabels[theme][locale]
}

const fontStacks = {
  wanted: '"Wanted Sans Variable", "Apple SD Gothic Neo", sans-serif',
  pretendard: '"Pretendard Variable", "Apple SD Gothic Neo", sans-serif',
  suit: '"SUIT Variable", "Apple SD Gothic Neo", sans-serif',
  "geist-wanted": '"Geist Variable", "Wanted Sans Variable", "Apple SD Gothic Neo", sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", sans-serif',
} satisfies Readonly<Record<UiFontFamily, string>>

export function uiFontFamilyStack(font: UiFontFamily): string {
  return fontStacks[font]
}

export function uiFontScalePercent(scale: number): number {
  return Math.round(scale * 100)
}

const fontScaleLabels = {
  ko: ["매우 작게", "작게", "기본", "크게", "아주 크게", "최대로 크게"],
  en: ["Very small", "Small", "Default", "Large", "Extra large", "Largest"],
} as const satisfies Readonly<Record<Locale, readonly string[]>>

export function uiFontScaleLabel(scale: number, locale: Locale = "ko"): string {
  const [tiny, small, normal, large, huge, largest] = fontScaleLabels[locale]
  const percent = uiFontScalePercent(scale)
  if (percent <= 85) return tiny
  if (percent < 100) return small
  if (percent === 100) return normal
  if (percent <= 125) return large
  if (percent <= 150) return huge
  return largest
}
