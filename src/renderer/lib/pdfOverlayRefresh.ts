import type { CSSProperties } from "react"
import type { PageOverlayState } from "./pdfOverlayAnalysis"

export type ViewerPageView = {
  readonly div?: HTMLElement | null
}

export type PageViewContainer = {
  readonly getPageView: (index: number) => ViewerPageView | null | undefined
}

export type OverlayPageSnapshot = {
  readonly page: HTMLElement
  readonly width: number
  readonly height: number
}

export function overlaySnapshot(state: PageOverlayState): OverlayPageSnapshot {
  return { page: state.pageDiv, width: state.pageWidth, height: state.pageHeight }
}

export function needsOverlayRefresh(
  previous: OverlayPageSnapshot | undefined,
  currentPage: HTMLElement,
  hasOverlay: boolean,
): boolean {
  if (!previous || previous.page !== currentPage || !hasOverlay) return true
  const rect = currentPage.getBoundingClientRect()
  return (
    Math.abs(rect.width - previous.width) > 0.5 || Math.abs(rect.height - previous.height) > 0.5
  )
}

export function nextOverlayState(
  previous: PageOverlayState | undefined,
  pageDiv: HTMLElement,
  analyzed: PageOverlayState | null,
): PageOverlayState | null {
  if (
    !needsOverlayRefresh(
      previous ? overlaySnapshot(previous) : undefined,
      pageDiv,
      previous !== undefined,
    )
  ) {
    return null
  }
  if (analyzed) return analyzed
  if (!previous) return null
  const rect = pageDiv.getBoundingClientRect()
  const scaleX = previous.pageWidth > 0 ? rect.width / previous.pageWidth : 1
  const scaleY = previous.pageHeight > 0 ? rect.height / previous.pageHeight : 1
  return {
    ...previous,
    structures: previous.structures.map((structure) => ({
      ...structure,
      bounds: {
        x: structure.bounds.x * scaleX,
        y: structure.bounds.y * scaleY,
        width: structure.bounds.width * scaleX,
        height: structure.bounds.height * scaleY,
      },
    })),
    pageDiv,
    pageWidth: rect.width,
    pageHeight: rect.height,
  }
}

export function pageOverlayStyle(
  pageDiv: HTMLElement,
  container: HTMLDivElement | null,
): CSSProperties {
  if (
    !container &&
    pageDiv.offsetLeft === 0 &&
    pageDiv.offsetTop === 0 &&
    pageDiv.offsetWidth === 0
  )
    return {}
  if (pageDiv.offsetWidth > 0 || pageDiv.offsetHeight > 0) {
    return {
      left: pageDiv.offsetLeft,
      top: pageDiv.offsetTop,
      width: pageDiv.offsetWidth,
      height: pageDiv.offsetHeight,
    }
  }
  if (!container) return {}
  const pageRect = pageDiv.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return {
    left: pageRect.left - containerRect.left,
    top: pageRect.top - containerRect.top,
    width: pageRect.width,
    height: pageRect.height,
  }
}

export function syncViewerWidth(container: HTMLDivElement, viewer: PageViewContainer): void {
  const firstPage = viewer.getPageView(0)?.div
  if (firstPage instanceof HTMLDivElement) container.style.width = `${firstPage.offsetWidth}px`
}
