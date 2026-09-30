import type { Locale } from "./i18n/locale"
import type { UiFontFamily } from "./schemas"

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
