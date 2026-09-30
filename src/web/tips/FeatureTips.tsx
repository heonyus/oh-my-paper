import { X } from "lucide-react"
import { type JSX, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useLocale, useTranslator } from "../../renderer/lib/locale"
import { webMessages } from "../messages"
import {
  type FeatureTip,
  localizedClip,
  nextTip,
  readTipState,
  type TipView,
  writeTipState,
} from "./tipCatalog"

const TIP_WIDTH = 320
const EDGE = 12
const SHOW_DELAY_MS = 1400

function visibleAnchor(selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return element
    }
  }
  return null
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

/**
 * The example clip; it disappears quietly when the clip is missing or cannot play. With reduced
 * motion it waits for play instead of starting on its own; `controls: false` keeps a thumbnail
 * that another control opens.
 */
export function TipClip({
  src,
  title,
  loop = true,
  controls = true,
  onEnded,
}: {
  readonly src: string
  readonly title: string
  readonly loop?: boolean
  readonly controls?: boolean
  readonly onEnded?: () => void
}): JSX.Element | null {
  const t = useTranslator(webMessages)
  const { locale } = useLocale()
  // The English clips were recorded on the English screen; a missing one falls back to Korean.
  const [tries, setTries] = useState(0)
  const reduced = prefersReducedMotion()
  const sources = [...new Set([localizedClip(src, locale), src])]
  const source = sources[tries]
  if (source === undefined) return null
  return (
    <video
      key={source}
      className="feature-tip-clip"
      src={source}
      autoPlay={!reduced}
      controls={reduced && controls}
      muted
      loop={loop}
      playsInline
      preload="auto"
      aria-label={t("tips.example", { title })}
      onError={() => setTries((count) => count + 1)}
      onEnded={onEnded}
    />
  )
}

export function TipKeys({ tip }: { readonly tip: FeatureTip }): JSX.Element | null {
  const t = useTranslator(webMessages)
  if (!tip.keys) return null
  return (
    <p className="feature-tip-keys">
      {tip.keys.map(([key, label]) => (
        <span key={key}>
          <kbd>{key}</kbd>
          {t(label)}
        </span>
      ))}
    </p>
  )
}

type Position = {
  readonly top?: number
  readonly bottom?: number
  readonly left: number
  readonly arrow: number | null
  readonly side: "below" | "above" | "inside"
}

function positionFor(tip: FeatureTip, rect: DOMRect): Position {
  const width = Math.min(TIP_WIDTH, window.innerWidth - EDGE * 2)
  const left = Math.min(
    Math.max(EDGE, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - EDGE,
  )
  if (tip.placement === "inside") {
    return { top: Math.max(EDGE, rect.top + 16), left, arrow: null, side: "inside" }
  }
  const arrow = Math.min(Math.max(20, rect.left + rect.width / 2 - left), width - 20)
  const roomBelow = window.innerHeight - rect.bottom
  if (roomBelow < 360 && rect.top > roomBelow) {
    return { bottom: window.innerHeight - rect.top + 10, left, arrow, side: "above" }
  }
  return { top: rect.bottom + 10, left, arrow, side: "below" }
}

/**
 * Shows at most one first-use tip per visit to a screen, beside the control it explains.
 * `visitKey` changes when the screen or the open paper changes.
 */
export function FeatureTips({
  view,
  hasDocument,
  visitKey,
}: {
  readonly view: TipView
  readonly hasDocument: boolean
  readonly visitKey: string
}): JSX.Element | null {
  const t = useTranslator(webMessages)
  const [tip, setTip] = useState<FeatureTip | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const shownThisVisit = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: each visit restarts the tip timer
  useEffect(() => {
    shownThisVisit.current = false
    setTip(null)
    const timer = window.setTimeout(() => {
      if (shownThisVisit.current) return
      const next = nextTip(view, hasDocument, readTipState(), visibleAnchor)
      if (next) {
        shownThisVisit.current = true
        setTip(next)
      }
    }, SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [view, hasDocument, visitKey])

  const place = useCallback((): void => {
    if (!tip) return
    const anchor = visibleAnchor(tip.anchor)
    if (!anchor) {
      setTip(null)
      return
    }
    setPosition(positionFor(tip, anchor.getBoundingClientRect()))
  }, [tip])

  useLayoutEffect(() => {
    if (!tip) {
      setPosition(null)
      return
    }
    place()
    let frame = 0
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    window.addEventListener("resize", schedule)
    window.addEventListener("scroll", schedule, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", schedule, true)
    }
  }, [tip, place])

  const dismiss = useCallback(
    (turnOff = false): void => {
      if (!tip) return
      const state = readTipState()
      writeTipState({ seen: [...new Set([...state.seen, tip.id])], off: state.off || turnOff })
      setTip(null)
    },
    [tip],
  )

  useEffect(() => {
    if (!tip) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tip, dismiss])

  if (!tip || !position) return null
  return (
    <div
      className="feature-tip"
      role="dialog"
      aria-labelledby={`feature-tip-${tip.id}`}
      data-side={position.side}
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: Math.min(TIP_WIDTH, window.innerWidth - EDGE * 2),
        ...(position.arrow === null ? {} : { "--tip-arrow": `${position.arrow}px` }),
      }}
    >
      <TipClip src={tip.clip} title={t(tip.title)} />
      <div className="feature-tip-body">
        <h2 id={`feature-tip-${tip.id}`}>{t(tip.title)}</h2>
        <p>{t(tip.body)}</p>
        <TipKeys tip={tip} />
        <div className="feature-tip-actions">
          <button type="button" className="feature-tip-off" onClick={() => dismiss(true)}>
            {t("tips.off")}
          </button>
          <button type="button" className="feature-tip-ok" onClick={() => dismiss()}>
            {t("tips.ok")}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="feature-tip-close"
        aria-label={t("tips.close")}
        onClick={() => dismiss()}
      >
        <X size={14} />
      </button>
    </div>
  )
}
