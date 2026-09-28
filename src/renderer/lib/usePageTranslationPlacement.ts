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
  /** Width of the source page, for a pane that mirrors it. */
  readonly pageWidth: number
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
    pageWidth: page.width / scale,
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
    Math.abs(left.height - right.height) < 0.25 &&
    Math.abs(left.pageWidth - right.pageWidth) < 0.25
  )
}

export function usePageTranslationPlacement(pageNumber: number): PageTranslationPlacement | null {
  const [placement, setPlacement] = useState<PageTranslationPlacement | null>(null)

  useEffect(() => {
    let disposed = false
    let frame: number | null = null
    let observedPage: HTMLElement | null = null

    const measure = (): void => {
      frame = null
      const page = document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
      const world = document.querySelector<HTMLElement>(".board-world")
      const surface = document.querySelector<HTMLElement>(".pdf-surface")
      if (!page || !world || disposed) return
      // pdf-surface는 확정된 줌으로 페이지를 그린 뒤 컨테이너를 과도기 배율로
      // 스케일한다. 두 값이 다른 동안의 측정은 세계 좌표가 아니라 과도기
      // 좌표라서 패널이 잘못된 위치에 놓인다. 페이지의 실제 세계 위치는 줌
      // 중에도 변하지 않으므로 이 동안은 지난 배치를 유지한다.
      if (
        surface &&
        surface.dataset["zoom"] !== undefined &&
        surface.dataset["renderedZoom"] !== undefined &&
        surface.dataset["zoom"] !== surface.dataset["renderedZoom"]
      )
        return
      if (page !== observedPage) {
        observedPage = page
        pageResize?.disconnect()
        pageResize?.observe(page)
      }
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

    const pageResize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    const layoutResize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    const mutations = new MutationObserver(schedule)

    const bind = (): void => {
      const viewer = document.querySelector<HTMLElement>(".pdfViewer")
      const world = document.querySelector<HTMLElement>(".board-world")
      const surface = document.querySelector<HTMLElement>(".pdf-surface")
      if (!viewer || !world) {
        if (!disposed) frame = requestAnimationFrame(bind)
        return
      }
      // .page는 .pdfViewer의 직계 자식이다. childList만으로 가상화된 페이지의
      // 마운트/언마운트를 잡고, 텍스트 레이어 같은 깊은 변경은 보지 않는다.
      mutations.observe(viewer, { childList: true })
      // 줌 확정은 pdf-surface의 data-rendered-zoom 갱신으로 알 수 있다.
      if (surface)
        mutations.observe(surface, {
          attributes: true,
          attributeFilter: ["data-zoom", "data-rendered-zoom"],
        })
      // 다른 페이지의 높이 확정으로 이 페이지의 세계 위치가 밀릴 수 있으므로
      // 페이지 자체뿐 아니라 뷰어 전체 크기도 관찰한다.
      layoutResize?.observe(viewer)
      layoutResize?.observe(world)
      window.addEventListener("resize", schedule)
      measure()
    }
    bind()
    return () => {
      disposed = true
      if (frame !== null) cancelAnimationFrame(frame)
      pageResize?.disconnect()
      layoutResize?.disconnect()
      mutations.disconnect()
      window.removeEventListener("resize", schedule)
    }
  }, [pageNumber])

  return placement
}
