import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react"
import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { GITHUB_REPO_URL } from "../../shared/githubStar"
import { markStarOpened } from "../star/starInviteRules"
import { TipClip, TipKeys } from "./FeatureTips"
import { FEATURE_TIPS, writeTipState } from "./tipCatalog"

const COUNT = FEATURE_TIPS.length

/**
 * Every tip in one place, reachable from the header's 사용법 button. A card opens its clip large,
 * one at a time, and a finished clip moves on to the next. The first-run page opens it large from
 * the first clip (`initialFocus`), with the engine download's progress (`status`) and, once that
 * is done, a `primary` action.
 */
export function TipsGallery({
  onClose,
  status,
  primary,
  initialFocus,
}: {
  readonly onClose: () => void
  readonly status?: ReactNode
  readonly primary?: { readonly label: string; readonly onClick: () => void } | undefined
  readonly initialFocus?: number
}): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [reset, setReset] = useState(false)
  const [focus, setFocus] = useState<number | null>(
    initialFocus === undefined ? null : Math.min(Math.max(initialFocus, 0), COUNT - 1),
  )
  const step = useCallback(
    (delta: number) =>
      setFocus((current) => (current === null ? current : (current + delta + COUNT) % COUNT)),
    [],
  )

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (focus === null) onClose()
        else setFocus(null)
        return
      }
      if (focus === null) return
      if (event.key === "ArrowRight") step(1)
      else if (event.key === "ArrowLeft") step(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, focus, step])

  const focused = focus === null ? undefined : FEATURE_TIPS[focus]

  return (
    <div className="tips-gallery-backdrop">
      <section
        className="tips-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tips-gallery-title"
      >
        <header>
          <div>
            <h2 id="tips-gallery-title">사용법</h2>
            <p>
              {focused
                ? "하나씩 크게 봅니다. 끝나면 다음 영상으로 넘어가고, ← → 로도 넘길 수 있습니다."
                : "기능마다 짧은 영상으로 봅니다. 누르면 크게 봅니다."}
            </p>
          </div>
          <button ref={closeRef} type="button" aria-label="사용법 닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {status}
        {focused && focus !== null ? (
          <div className="tips-gallery-focus">
            <TipClip
              key={focused.id}
              src={focused.clip}
              title={focused.title}
              loop={false}
              onEnded={() => step(1)}
            />
            <div className="tips-gallery-focus-text">
              <h3>{focused.title}</h3>
              <p>{focused.body}</p>
              <TipKeys tip={focused} />
            </div>
            <nav className="tips-gallery-focus-nav" aria-label="사용법 영상 넘기기">
              <button type="button" onClick={() => setFocus(null)}>
                모두 보기
              </button>
              <span aria-live="polite">
                {focus + 1} / {COUNT}
              </span>
              <button type="button" aria-label="이전 영상" onClick={() => step(-1)}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" aria-label="다음 영상" onClick={() => step(1)}>
                <ChevronRight size={16} />
              </button>
            </nav>
          </div>
        ) : (
          <ul>
            {FEATURE_TIPS.map((tip, index) => (
              <li key={tip.id}>
                <div className="tips-gallery-thumb">
                  <TipClip src={tip.clip} title={tip.title} controls={false} />
                  <button
                    type="button"
                    className="tips-gallery-enlarge"
                    aria-label={`${tip.title} 크게 보기`}
                    onClick={() => setFocus(index)}
                  >
                    <span>
                      <Maximize2 size={14} aria-hidden="true" /> 크게 보기
                    </span>
                  </button>
                </div>
                <h3>{tip.title}</h3>
                <p>{tip.body}</p>
                <TipKeys tip={tip} />
              </li>
            ))}
          </ul>
        )}
        <footer>
          <a
            className="tips-gallery-star"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markStarOpened}
          >
            ⭐ GitHub에서 별 달기
          </a>
          <button
            type="button"
            disabled={reset}
            onClick={() => {
              writeTipState({ seen: [], off: false })
              setReset(true)
            }}
          >
            {reset ? "기능을 처음 열 때 다시 보여줍니다" : "팁 다시 보기"}
          </button>
          {primary ? (
            <button type="button" className="tips-gallery-primary" onClick={primary.onClick}>
              {primary.label}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  )
}
