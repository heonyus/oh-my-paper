import type { UiFontFamily } from "./schemas"

export const uiFontOptions = [
  { value: "wanted", label: "Wanted Sans" },
  { value: "pretendard", label: "Pretendard" },
  { value: "suit", label: "SUIT" },
  { value: "geist-wanted", label: "Geist 영문 + Wanted Sans 한글" },
  { value: "system", label: "시스템 글꼴" },
] as const satisfies readonly { readonly value: UiFontFamily; readonly label: string }[]

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

export function uiFontScaleLabel(scale: number): string {
  const percent = uiFontScalePercent(scale)
  if (percent <= 85) return "매우 작게"
  if (percent < 100) return "작게"
  if (percent === 100) return "기본"
  if (percent <= 125) return "크게"
  if (percent <= 150) return "아주 크게"
  return "최대로 크게"
}
