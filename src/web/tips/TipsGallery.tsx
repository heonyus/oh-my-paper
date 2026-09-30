import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react"
import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import { useTranslator } from "../../renderer/lib/locale"
import { GITHUB_REPO_URL } from "../../shared/githubStar"
import { webMessages } from "../messages"
import { markStarOpened } from "../star/starInviteRules"
import { TipClip, TipKeys } from "./FeatureTips"
import { FEATURE_TIPS, writeTipState } from "./tipCatalog"

const COUNT = FEATURE_TIPS.length

/**
 * Every tip in one place, reachable from the header's 사용법 button. A card opens its clip large,
 * one at a time, and a finished clip moves on to the next. The first-run welcome opens it large
 * from the first clip (`initialFocus`).
 */
export function TipsGallery({
  onClose,
  initialFocus,
}: {
  readonly onClose: () => void
  readonly initialFocus?: number
}): JSX.Element {
  const t = useTranslator(webMessages)
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
            <h2 id="tips-gallery-title">{t("gallery.title")}</h2>
            <p>{focused ? t("gallery.focused") : t("gallery.all")}</p>
          </div>
          <button ref={closeRef} type="button" aria-label={t("gallery.close")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {focused && focus !== null ? (
          <div className="tips-gallery-focus">
            <TipClip
              key={focused.id}
              src={focused.clip}
              title={t(focused.title)}
              loop={false}
              onEnded={() => step(1)}
            />
            <div className="tips-gallery-focus-text">
              <h3>{t(focused.title)}</h3>
              <p>{t(focused.body)}</p>
              <TipKeys tip={focused} />
            </div>
            <nav className="tips-gallery-focus-nav" aria-label={t("gallery.nav")}>
              <button type="button" onClick={() => setFocus(null)}>
                {t("gallery.showAll")}
              </button>
              <span aria-live="polite">
                {focus + 1} / {COUNT}
              </span>
              <button type="button" aria-label={t("gallery.prev")} onClick={() => step(-1)}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" aria-label={t("gallery.next")} onClick={() => step(1)}>
                <ChevronRight size={16} />
              </button>
            </nav>
          </div>
        ) : (
          <ul>
            {FEATURE_TIPS.map((tip, index) => (
              <li key={tip.id}>
                <div className="tips-gallery-thumb">
                  <TipClip src={tip.clip} title={t(tip.title)} controls={false} />
                  <button
                    type="button"
                    className="tips-gallery-enlarge"
                    aria-label={t("gallery.enlargeLabel", { title: t(tip.title) })}
                    onClick={() => setFocus(index)}
                  >
                    <span>
                      <Maximize2 size={14} aria-hidden="true" /> {t("gallery.enlarge")}
                    </span>
                  </button>
                </div>
                <h3>{t(tip.title)}</h3>
                <p>{t(tip.body)}</p>
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
            {t("gallery.star")}
          </a>
          <button
            type="button"
            disabled={reset}
            onClick={() => {
              writeTipState({ seen: [], off: false })
              setReset(true)
            }}
          >
            {reset ? t("gallery.resetDone") : t("gallery.reset")}
          </button>
        </footer>
      </section>
    </div>
  )
}
