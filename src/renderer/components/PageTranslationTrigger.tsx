import { Languages, X } from "lucide-react"
import type { JSX } from "react"
import { togglePageTranslation, usePageTranslationSession } from "../lib/pageTranslationToggle"

export function PageTranslationTrigger({ page }: { readonly page: number }): JSX.Element {
  const translation = usePageTranslationSession()
  const active = translation.openPages.includes(page)
  return (
    <button
      type="button"
      className="page-translation-trigger"
      data-active={active}
      aria-label={`p. ${page} 페이지 번역 ${active ? "닫기" : "열기"}`}
      aria-pressed={active}
      onClick={() => togglePageTranslation(page)}
    >
      {active ? <X size={13} /> : <Languages size={13} />}
      <span>페이지 번역</span>
    </button>
  )
}
