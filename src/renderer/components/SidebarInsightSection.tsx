import { ChevronDown, Copy, Pin, RefreshCw } from "lucide-react"
import { type JSX, useId, useState } from "react"
import { MarkdownContent } from "./MarkdownContent"

type SidebarInsightSectionProps = {
  readonly title: string
  readonly value: string
  readonly loading: boolean
  readonly error: string
  readonly onGenerate: () => void
  readonly onSave: () => void
}

export function SidebarInsightSection({
  title,
  value,
  loading,
  error,
  onGenerate,
  onSave,
}: SidebarInsightSectionProps): JSX.Element {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const bodyId = useId()
  const long = value.length > 260
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
                aria-label={`${title} 복사`}
                onClick={() => void navigator.clipboard?.writeText(value)}
              >
                <Copy size={14} />
              </button>
              <button type="button" aria-label={`${title} 보드에 저장`} onClick={onSave}>
                <Pin size={14} />
              </button>
            </>
          ) : null}
          <button type="button" aria-label={`${title} 다시 생성`} onClick={onGenerate}>
            <RefreshCw size={14} />
          </button>
        </div>
      </header>
      <div id={bodyId} className="insight-body" data-expanded={showAll} hidden={!open}>
        {loading ? <span className="insight-progress" aria-hidden="true" /> : null}
        {!loading && error ? <p className="insight-error">{error}</p> : null}
        {value ? (
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
                aria-label={`${title} ${showAll ? "접기" : "전체 내용 펼치기"}`}
                onClick={() => setShowAll(!showAll)}
              >
                <span>{showAll ? "접기" : "더 보기"}</span>
                <ChevronDown size={12} />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
