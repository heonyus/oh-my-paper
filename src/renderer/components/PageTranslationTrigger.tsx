import { Languages, X } from "lucide-react"
import type { JSX } from "react"
import { useTranslator } from "../lib/locale"
import { togglePageTranslation, usePageTranslationSession } from "../lib/pageTranslationToggle"
import { readerMessages } from "../messages/reader"

export function PageTranslationTrigger({ page }: { readonly page: number }): JSX.Element {
  const t = useTranslator(readerMessages)
  const translation = usePageTranslationSession()
  const active = translation.openPages.includes(page)
  return (
    <button
      type="button"
      className="page-translation-trigger"
      data-active={active}
      aria-label={t(active ? "translation.triggerClose" : "translation.triggerOpen", { page })}
      aria-pressed={active}
      onClick={() => togglePageTranslation(page)}
    >
      {active ? <X size={13} /> : <Languages size={13} />}
      <span>{t("translation.trigger")}</span>
    </button>
  )
}
