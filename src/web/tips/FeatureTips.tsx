import { X } from "lucide-react"
import { type JSX, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  FEATURE_TIPS,
  type FeatureTip,
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

/** The looping example; it disappears quietly when the clip is missing or cannot play. */
function TipClip({
  src,
  title,
}: {
  readonly src: string
  readonly title: string
}): JSX.Element | null {
  const [failed, setFailed] = useState(false)
  const reduced = prefersReducedMotion()
  if (failed) return null
  return (
    <video
      className="feature-tip-clip"
      src={src}
      autoPlay={!reduced}
      controls={reduced}
      muted
      loop
      playsInline
      preload="auto"
      aria-label={`${title} 사용 예시`}
      onError={() => setFailed(true)}
    />
  )
}

function TipKeys({ tip }: { readonly tip: FeatureTip }): JSX.Element | null {
  if (!tip.keys) return null
  return (
    <p className="feature-tip-keys">
      {tip.keys.map(([key, label]) => (
        <span key={key}>
          <kbd>{key}</kbd>
          {label}
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
      <TipClip src={tip.clip} title={tip.title} />
      <div className="feature-tip-body">
        <h2 id={`feature-tip-${tip.id}`}>{tip.title}</h2>
        <p>{tip.body}</p>
        <TipKeys tip={tip} />
        <div className="feature-tip-actions">
          <button type="button" className="feature-tip-off" onClick={() => dismiss(true)}>
            팁 끄기
          </button>
          <button type="button" className="feature-tip-ok" onClick={() => dismiss()}>
            알겠어요
          </button>
        </div>
      </div>
      <button
        type="button"
        className="feature-tip-close"
        aria-label="팁 닫기"
        onClick={() => dismiss()}
      >
        <X size={14} />
      </button>
    </div>
  )
}

/** Every tip in one place, reachable from the header's 사용법 button. */
export function TipsGallery({ onClose }: { readonly onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [reset, setReset] = useState(false)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

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
            <p>기능마다 짧은 영상으로 봅니다.</p>
          </div>
          <button ref={closeRef} type="button" aria-label="사용법 닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <ul>
          {FEATURE_TIPS.map((tip) => (
            <li key={tip.id}>
              <TipClip src={tip.clip} title={tip.title} />
              <h3>{tip.title}</h3>
              <p>{tip.body}</p>
              <TipKeys tip={tip} />
            </li>
          ))}
        </ul>
        <footer>
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
        </footer>
      </section>
    </div>
  )
}
