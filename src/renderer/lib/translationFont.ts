import { useEffect, useState } from "react"

/** The typeface translations are set in on the mirrored page. */
export type TranslationFont = "auto" | "serif" | "sans"

export const translationFontOptions = [
  {
    value: "auto",
    label: "원문 따라가기",
    detail: "본문은 명조, 제목은 고딕처럼 원문 글꼴을 따릅니다",
  },
  { value: "serif", label: "명조", detail: "나눔명조 · Noto Serif KR" },
  { value: "sans", label: "고딕", detail: "화면 글꼴과 같은 고딕" },
] as const satisfies readonly {
  readonly value: TranslationFont
  readonly label: string
  readonly detail: string
}[]

const storageKey = "ohmypaper:translation-font:v1"
const changeEvent = "ohmypaper:translation-font"

function isTranslationFont(value: string | null): value is TranslationFont {
  return value === "auto" || value === "serif" || value === "sans"
}

export function readTranslationFont(): TranslationFont {
  try {
    const value = globalThis.localStorage.getItem(storageKey)
    return isTranslationFont(value) ? value : "auto"
  } catch {
    return "auto"
  }
}

export function writeTranslationFont(font: TranslationFont): void {
  try {
    globalThis.localStorage.setItem(storageKey, font)
  } catch {
    // Storage can be unavailable; the choice still applies until reload.
  }
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: font }))
}

/** The chosen translation typeface, kept in step across open views. */
export function useTranslationFont(): readonly [TranslationFont, (font: TranslationFont) => void] {
  const [font, setFont] = useState<TranslationFont>(readTranslationFont)
  useEffect(() => {
    const update = (): void => setFont(readTranslationFont())
    window.addEventListener(changeEvent, update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener(changeEvent, update)
      window.removeEventListener("storage", update)
    }
  }, [])
  return [font, writeTranslationFont]
}
