import { useEffect, useState } from "react"
import { pageTranslationLayout } from "../../shared/uiLayout"

type ScreenRect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export type PageTranslationPlacement = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export function pageTranslationWorldPlacement(
  page: ScreenRect,
  world: ScreenRect,
  worldWidth: number,
): PageTranslationPlacement | null {
  const scale = worldWidth > 0 ? world.width / worldWidth : 0
  if (!Number.isFinite(scale) || scale <= 0) return null
  return {
    left: (page.left + page.width - world.left) / scale + pageTranslationLayout.gap,
    top: (page.top - world.top) / scale,
    width: pageTranslationLayout.width,
    height: page.height / scale,
  }
}

function samePlacement(
  left: PageTranslationPlacement | null,
  right: PageTranslationPlacement | null,
): boolean {
  if (!left || !right) return left === right
  return (
    Math.abs(left.left - right.left) < 0.25 &&
    Math.abs(left.top - right.top) < 0.25 &&
    Math.abs(left.width - right.width) < 0.25 &&
    Math.abs(left.height - right.height) < 0.25
  )
}

export function usePageTranslationPlacement(pageNumber: number): PageTranslationPlacement | null {
  const [placement, setPlacement] = useState<PageTranslationPlacement | null>(null)

  useEffect(() => {
    let disposed = false
    let frame: number | null = null
    let resize: ResizeObserver | null = null
    let mutations: MutationObserver | null = null
    const measure = (): void => {
      frame = null
      const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
      const world = document.querySelector<HTMLElement>(".board-world")
      if (!page || !world || disposed) return
      const next = pageTranslationWorldPlacement(
        page.getBoundingClientRect(),
        world.getBoundingClientRect(),
        world.offsetWidth,
      )
      setPlacement((current) => (samePlacement(current, next) ? current : next))
    }
    const schedule = (): void => {
      if (frame === null) frame = requestAnimationFrame(measure)
    }
    const bind = (): void => {
      const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
      const world = document.querySelector<HTMLElement>(".board-world")
      const surface = document.querySelector<HTMLElement>(".pdf-surface")
      if (!page || !world || !surface) {
        if (!disposed) frame = requestAnimationFrame(bind)
        return
      }
      resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
      resize?.observe(page)
      mutations = new MutationObserver(schedule)
      mutations.observe(world, { attributes: true, attributeFilter: ["style"] })
      mutations.observe(surface, { attributes: true, attributeFilter: ["style"] })
      window.addEventListener("resize", schedule)
      measure()
    }
    bind()
    return () => {
      disposed = true
      if (frame !== null) cancelAnimationFrame(frame)
      resize?.disconnect()
      mutations?.disconnect()
      window.removeEventListener("resize", schedule)
    }
  }, [pageNumber])

  return placement
}
