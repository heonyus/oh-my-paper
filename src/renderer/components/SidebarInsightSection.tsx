import { ChevronDown, Copy, Pin, RefreshCw } from "lucide-react"
import { type JSX, useState } from "react"

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
  const long = value.length > 260
  return (
    <section className="insight-section" data-open={open}>
      <header>
        <button type="button" className="insight-title" onClick={() => setOpen((value) => !value)}>
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
      {open ? (
        <div className="insight-body">
          {loading ? <p className="insight-muted">AI가 근거를 정리하는 중입니다…</p> : null}
          {!loading && error ? <p className="insight-error">{error}</p> : null}
          {!loading && !error && !value ? (
            <button type="button" className="insight-generate" onClick={onGenerate}>
              생성하기
            </button>
          ) : null}
          {value ? (
            <>
              <p className={long && !showAll ? "insight-clamped" : undefined}>{value}</p>
              {long ? (
                <button
                  type="button"
                  className="insight-show-all"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? "접기" : "전체 보기"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
