import { ChevronDown, Copy, Pin, RefreshCw } from "lucide-react"
import { type JSX, useId, useState } from "react"
import { useTranslator } from "../lib/locale"
import { researchMessages } from "../messages/research"
import { MarkdownContent } from "./MarkdownContent"

type SidebarInsightSectionProps = {
  readonly title: string
  readonly value: string
  readonly loading: boolean
  readonly error: string
  readonly onGenerate: () => void
  readonly onSave: () => void
  /** Shown in place of the Markdown value, unclamped, when the section has its own view. */
  readonly view?: JSX.Element | null | undefined
}

export function SidebarInsightSection({
  title,
  value,
  loading,
  error,
  onGenerate,
  onSave,
  view,
}: SidebarInsightSectionProps): JSX.Element {
  const t = useTranslator(researchMessages)
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const bodyId = useId()
  const long = !view && value.length > 260
  return (
    <section className="insight-section" data-open={open}>
      <header>
        <button
          type="button"
          className="insight-title"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={15} /> {title}
        </button>
        <div className="insight-actions">
          {value ? (
            <>
              <button
                type="button"
                aria-label={t("insight.copy", { title })}
                onClick={() => void navigator.clipboard?.writeText(value)}
              >
                <Copy size={14} />
              </button>
              <button type="button" aria-label={t("insight.save", { title })} onClick={onSave}>
                <Pin size={14} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            aria-label={t("insight.regenerate", { title })}
            onClick={onGenerate}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>
      <div id={bodyId} className="insight-body" data-expanded={showAll} hidden={!open}>
        {loading ? <span className="insight-progress" aria-hidden="true" /> : null}
        {!loading && error ? <p className="insight-error">{error}</p> : null}
        {value && view ? view : null}
        {value && !view ? (
          <>
            <MarkdownContent
              className={long && !showAll ? "insight-clamped" : undefined}
              source={value}
            />
            {long ? (
              <button
                type="button"
                className="insight-disclosure"
                aria-expanded={showAll}
                aria-label={
                  showAll
                    ? t("insight.collapseLabel", { title })
                    : t("insight.expandLabel", { title })
                }
                onClick={() => setShowAll(!showAll)}
              >
                <span>{showAll ? t("insight.collapse") : t("insight.more")}</span>
                <ChevronDown size={12} />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
