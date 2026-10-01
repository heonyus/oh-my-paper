import type { PDFPageProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs"
import {
  type CSSProperties,
  type JSX,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { parsedDocumentPage } from "../lib/documentPageRuntime"
import { onPageRendered } from "../lib/pageRenderEvents"
import {
  backgroundColor,
  columnRuns,
  fitFontSize,
  type LayoutRegion,
  type PageFraction,
  regionBottomLimit,
} from "../lib/pageTranslationLayoutRegions"
import { focusPageSource, setPageSourceActive } from "../lib/pageTranslationSource"
import { useTranslationFont } from "../lib/translationFont"
import type { DocumentId } from "../types"
import { MarkdownContent } from "./MarkdownContent"

/**
 * Font sizes are percent of the mirrored page's width (`cqw` via `--fit-font-size`), so a fit
 * holds at every zoom.
 */
const fallbackFontSize = { body: 1.6, heading: 2 } as const
/** A translation keeps at least this share of the source size while space allows. */
const shrinkInPlace = 0.9
const shrinkMost = 0.6
/** A layout model's equation box can be tight; its LaTeX may need much smaller type to fit. */
const shrinkEquation = 0.4
/** Page layout labels that belong to the text flow rather than stand in its way. */
const flowingLabels = new Set(["text", "list", "references", "footnote", "aside_text"])
/** Masks reach this far past a region, as a fraction of the page, to cover glyph overhang. */
const maskPad = 0.003

function sourcePage(pageNumber: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`)
}

/** Median font size of the source spans a region was read from, in percent of page width. */
function sourceFontSize(pageNumber: number, region: LayoutRegion): number | null {
  const page = sourcePage(pageNumber)
  if (!page || page.offsetWidth <= 0) return null
  const ids = new Set(region.blockIds)
  const sizes = [
    ...page.querySelectorAll<HTMLElement>(".textLayer [data-page-translation-block]"),
  ].flatMap((span) => {
    const mapped = span.getAttribute("data-page-translation-block")?.split(",") ?? []
    if (!mapped.some((id) => ids.has(id))) return []
    const size = Number.parseFloat(getComputedStyle(span).fontSize)
    return Number.isFinite(size) && size > 0 ? [(size / page.offsetWidth) * 100] : []
  })
  if (sizes.length === 0) return null
  sizes.sort((left, right) => left - right)
  const size = sizes[Math.floor(sizes.length / 2)] ?? null
  return size === null ? null : Math.min(5, Math.max(0.8, size))
}

function sampleBorder(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const canvas = context.canvas
  const strips = [
    [x, y - 3, width, 2],
    [x, y + height + 1, width, 2],
    [x - 3, y, 2, height],
    [x + width + 1, y, 2, height],
  ] as const
  const chunks = strips.flatMap(([left, top, stripWidth, stripHeight]) => {
    const clampedLeft = Math.max(0, Math.round(left))
    const clampedTop = Math.max(0, Math.round(top))
    const clampedWidth = Math.min(canvas.width - clampedLeft, Math.round(stripWidth))
    const clampedHeight = Math.min(canvas.height - clampedTop, Math.round(stripHeight))
    if (clampedWidth <= 0 || clampedHeight <= 0) return []
    return [context.getImageData(clampedLeft, clampedTop, clampedWidth, clampedHeight).data]
  })
  const pixels = new Uint8ClampedArray(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    pixels.set(chunk, offset)
    offset += chunk.length
  }
  return backgroundColor(pixels)
}

/** Whether a canvas row holds a horizontal rule: one dark stroke far longer than any glyph. */
function isRuleRow(context: CanvasRenderingContext2D, left: number, row: number, width: number) {
  const data = context.getImageData(left, row, width, 1).data
  const needed = Math.max(24, context.canvas.width * 0.08)
  let run = 0
  for (let index = 0; index + 3 < data.length; index += 4) {
    const dark = (data[index] ?? 255) + (data[index + 1] ?? 255) + (data[index + 2] ?? 255) < 420
    run = dark ? run + 1 : 0
    if (run >= needed) return true
  }
  return false
}

/**
 * A mask's rows, pulled in off a rule that touches its top or bottom edge — the rule over
 * a page's footnotes sits right against their first line — so the rule stays on the page.
 */
function clearOfRules(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  band: number,
): { readonly top: number; readonly bottom: number } {
  const canvas = context.canvas
  const left = Math.max(0, Math.round(x))
  const span = Math.min(canvas.width - left, Math.round(width))
  let top = Math.max(0, Math.round(y))
  let bottom = Math.min(canvas.height, Math.round(y + height))
  if (span <= 0) return { top, bottom }
  for (let row = Math.min(bottom - 1, top + Math.round(band)); row >= top; row -= 1)
    if (isRuleRow(context, left, row, span)) {
      top = row + 1
      break
    }
  for (let row = Math.max(top, bottom - Math.round(band)); row < bottom; row += 1)
    if (isRuleRow(context, left, row, span)) {
      bottom = row
      break
    }
  return { top, bottom }
}

/** Pixels of our own page render: sharp at high zoom on a retina screen, bounded in memory. */
const renderPixelBudget = 12_000_000

type RenderedPage = {
  readonly page: PDFPageProxy
  readonly width: number
  readonly canvas: HTMLCanvasElement
}

function viewerCanvas(pageNumber: number): HTMLCanvasElement | null {
  const canvas = sourcePage(pageNumber)?.querySelector<HTMLCanvasElement>(".canvasWrapper canvas")
  return canvas && canvas.width > 0 && canvas.height > 0 ? canvas : null
}

/**
 * Draws the source page and paints over each translated region with the paper colour around
 * it, leaving figures, rules and untranslated text as they are. The page is rendered from the
 * PDF at the size it is shown, so it stays as sharp as the original at any zoom; until that
 * render is ready, the reader's own canvas stands in.
 */
function useMirroredPage(
  pageNumber: number,
  pdfPage: PDFPageProxy | null,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  masks: readonly PageFraction[],
): void {
  const rendered = useRef<RenderedPage | null>(null)
  useEffect(() => {
    let cancelled = false
    let task: RenderTask | null = null

    function paint(source: HTMLCanvasElement): void {
      const target = canvasRef.current
      const context = target?.getContext("2d", { willReadFrequently: true })
      if (!target || !context) return
      target.width = source.width
      target.height = source.height
      context.drawImage(source, 0, 0)
      for (const mask of masks) {
        const x = (mask.x - maskPad) * target.width
        const y = (mask.y - maskPad) * target.height
        const width = (mask.width + maskPad * 2) * target.width
        const height = (mask.height + maskPad * 2) * target.height
        context.fillStyle = sampleBorder(context, x, y, width, height)
        const band = maskPad * 2 * target.height
        const { top, bottom } = clearOfRules(context, x, y, width, height, band)
        if (bottom > top) context.fillRect(x, top, width, bottom - top)
      }
    }

    async function update(): Promise<void> {
      const current = rendered.current
      const shown = (containerRef.current?.getBoundingClientRect().width ?? 0) * devicePixelRatio
      const fresh =
        current?.page === pdfPage &&
        (shown === 0 || Math.abs(shown - current.width) / current.width < 0.15)
      if (current && fresh) {
        paint(current.canvas)
        return
      }
      const stand = viewerCanvas(pageNumber)
      if (stand) paint(stand)
      if (!pdfPage || shown === 0) return
      const base = pdfPage.getViewport({ scale: 1 })
      const scale = Math.min(
        shown / base.width,
        Math.sqrt(renderPixelBudget / (base.width * base.height)),
      )
      const viewport = pdfPage.getViewport({ scale })
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d")
      if (!context) return
      task?.cancel()
      task = pdfPage.render({ canvas, canvasContext: context, viewport })
      try {
        await task.promise
      } catch {
        return
      }
      if (cancelled) return
      rendered.current = { page: pdfPage, width: shown, canvas }
      paint(canvas)
    }

    void update()
    // The reader re-renders a page after a zoom; that is when a sharper render is due.
    const unsubscribe = onPageRendered(pageNumber, () => void update())
    return () => {
      cancelled = true
      task?.cancel()
      unsubscribe()
    }
  }, [pageNumber, pdfPage, canvasRef, containerRef, masks])
}

type Fit = { readonly size: number; readonly fits: boolean; readonly inPlace: boolean }

function regionElement(container: HTMLElement, region: LayoutRegion): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-region-id="${CSS.escape(region.id)}"]`)
}

function centreWithin(inner: PageFraction, outer: PageFraction): boolean {
  const x = inner.x + inner.width / 2
  const y = inner.y + inner.height / 2
  return x >= outer.x && x <= outer.x + outer.width && y >= outer.y && y <= outer.y + outer.height
}

/** How far down a region may grow: to whatever sits below it that is not part of it. */
function roomBelow(rect: PageFraction, obstacles: readonly PageFraction[]): number {
  return regionBottomLimit(
    rect,
    obstacles.filter((other) => other !== rect && !centreWithin(other, rect)),
  )
}

/**
 * A heading stays on one line from where the source heading starts, no taller than the
 * source heading, shrinking if it must.
 */
function fitHeading(
  element: HTMLElement,
  region: LayoutRegion,
  max: number,
  pageHeight: number,
): void {
  element.style.height = "auto"
  element.style.width = "max-content"
  // A one-line heading may run on to the right; one the source wraps keeps to its width.
  const pageWidth = element.parentElement?.clientWidth ?? 0
  const lineHeight = ((region.size ?? 0) / 100) * pageWidth * 1.3
  const wrapped = lineHeight > 0 && region.rect.height * pageHeight > lineHeight * 1.5
  element.style.maxWidth = `${(wrapped ? region.rect.width * 1.03 : Math.max(region.rect.width, 0.96 - region.rect.x)) * 100}%`
  const tallest = region.rect.height * pageHeight * 1.15
  const fits = (size: number): boolean => {
    element.style.setProperty("--fit-font-size", String(size))
    return (
      element.scrollWidth <= element.clientWidth + 1 &&
      (pageHeight <= 0 || element.scrollHeight <= tallest + 1)
    )
  }
  const result = fitFontSize(fits, max, max * shrinkMost)
  element.style.setProperty("--fit-font-size", String(result.size))
  element.setAttribute("data-overflow", String(!result.fits))
}

/** A page without layout: shrink to fit the box, then grow into free space. */
function fitInBox(
  element: HTMLElement,
  region: LayoutRegion,
  max: number,
  obstacles: readonly PageFraction[],
): void {
  const fits = (size: number): boolean => {
    element.style.setProperty("--fit-font-size", String(size))
    return element.scrollHeight <= element.clientHeight + 1
  }
  element.style.height = `${region.rect.height * 100}%`
  let result = fitFontSize(fits, max, max * shrinkInPlace)
  if (!result.fits) {
    element.style.height = `${(roomBelow(region.rect, obstacles) - region.rect.y) * 100}%`
    result = fitFontSize(fits, max, max * shrinkMost)
  }
  element.style.setProperty("--fit-font-size", String(result.size))
  element.setAttribute("data-overflow", String(!result.fits))
}

/**
 * A display equation starts at the body text's size, centred in its source box, and shrinks
 * until it fits that box both ways.
 */
function fitEquation(element: HTMLElement, region: LayoutRegion, max: number): void {
  element.style.height = `${region.rect.height * 100}%`
  const fits = (size: number): boolean => {
    element.style.setProperty("--fit-font-size", String(size))
    return (
      element.scrollWidth <= element.clientWidth + 1 &&
      element.scrollHeight <= element.clientHeight + 1
    )
  }
  const result = fitFontSize(fits, max, max * shrinkEquation)
  element.style.setProperty("--fit-font-size", String(result.size))
  element.setAttribute("data-overflow", String(!result.fits))
}

/**
 * Sets a run of paragraphs as one flow down its column at one size: each keeps the gap the
 * source has before it, so paragraph spacing matches and any space a shorter translation
 * frees gathers at the end of the run. Returns the height the run takes, as a page fraction.
 */
function flowRun(
  run: readonly LayoutRegion[],
  elements: readonly HTMLElement[],
  size: number,
  pageHeight: number,
): number {
  const first = run[0]
  if (!first) return 0
  let y = first.rect.y
  run.forEach((region, index) => {
    const element = elements[index]
    if (!element) return
    const previous = run[index - 1]
    if (previous) y += Math.max(0, region.rect.y - (previous.rect.y + previous.rect.height))
    element.style.setProperty("--fit-font-size", String(size))
    element.style.height = "auto"
    element.style.top = `${y * 100}%`
    y += element.offsetHeight / pageHeight
  })
  return y - first.rect.y
}

/**
 * Typesets the translations: paragraphs flow down their column runs at one common size, and
 * headings fit their own boxes. Sizes are relative to the page width, so a layout holds at
 * any zoom; only a change of shape or of the text needs another pass.
 */
function useFittedRegions(
  pageNumber: number,
  documentId: DocumentId,
  containerRef: RefObject<HTMLDivElement | null>,
  regions: readonly LayoutRegion[],
): void {
  const [shape, setShape] = useState<string | null>(null)
  const laidOut = useRef({ key: "", at: 0 })
  const trailing = useRef<number | null>(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      setShape("static")
      return
    }
    const observer = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container
      setShape(clientWidth > 0 && clientHeight > 0 ? (clientWidth / clientHeight).toFixed(2) : null)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])
  useEffect(
    () => () => {
      if (trailing.current !== null) window.clearTimeout(trailing.current)
    },
    [],
  )

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || shape === null) return
    const key = `${shape}|${regions.map((region) => `${region.id}:${region.translation}`).join("|")}`
    if (laidOut.current.key === key) return
    const layout = (): void => {
      laidOut.current = { key, at: performance.now() }
      const parsed = parsedDocumentPage(documentId, pageNumber)
      const pageBlocks = (parsed?.layout ?? parsed?.blocks ?? []).map((block) => ({
        label: block.label,
        rect: {
          x: block.bounds.x / (parsed?.width ?? 1),
          y: block.bounds.y / (parsed?.height ?? 1),
          width: block.bounds.width / (parsed?.width ?? 1),
          height: block.bounds.height / (parsed?.height ?? 1),
        },
      }))
      const standalone = regions.filter((region) => !region.typography)
      const paragraphs = regions.filter((region) => region.typography)
      const obstacles = [...regions.map((region) => region.rect), ...pageBlocks.map((b) => b.rect)]
      const bodySizes = paragraphs
        .map((region) => region.typography?.fontSize ?? 0)
        .filter((size) => size > 0)
        .sort((left, right) => left - right)
      const bodySize = bodySizes[Math.floor(bodySizes.length / 2)] ?? fallbackFontSize.body
      for (const region of standalone) {
        const element = regionElement(container, region)
        if (!element) continue
        if (region.kind === "equation") {
          fitEquation(element, region, bodySize)
          continue
        }
        const max =
          region.size ?? sourceFontSize(pageNumber, region) ?? fallbackFontSize[region.kind]
        if (region.kind === "heading") fitHeading(element, region, max, container.clientHeight)
        else fitInBox(element, region, max, obstacles)
      }
      const pageHeight = container.clientHeight
      if (pageHeight <= 0) return
      const runs = columnRuns(paragraphs, [
        ...standalone.map((region) => region.rect),
        ...pageBlocks.filter((block) => !flowingLabels.has(block.label)).map((block) => block.rect),
      ])
      const fits = runs.map((run): Fit => {
        const elements = run.map((region) => regionElement(container, region))
        const present = elements.filter((element): element is HTMLElement => element !== null)
        const first = run[0]
        const last = run.at(-1)
        if (!first || !last || present.length !== run.length)
          return { size: 0, fits: false, inPlace: false }
        const max = Math.min(...run.map((region) => region.typography?.fontSize ?? Infinity))
        const span = last.rect.y + last.rect.height - first.rect.y
        const fitsWithin = (room: number) => (size: number) =>
          flowRun(run, present, size, pageHeight) <= room + 1 / pageHeight
        // Keep close to the source size: use the run's own space, then free space below it,
        // and only then set smaller type.
        const room = roomBelow(last.rect, obstacles) - first.rect.y
        const inPlace = fitFontSize(fitsWithin(span), max, max * shrinkInPlace)
        if (inPlace.fits) return { ...inPlace, inPlace: true }
        const grown = fitFontSize(fitsWithin(room), max, max * shrinkInPlace)
        if (grown.fits) return { ...grown, inPlace: true }
        return { ...fitFontSize(fitsWithin(room), max, max * shrinkMost), inPlace: false }
      })
      // Runs set in the same source size (all body text, or all captions) share one size, so
      // they read as one text; a denser run that needs smaller type keeps its own.
      const sourceSizes = runs.map((run) =>
        Math.min(...run.map((region) => region.typography?.fontSize ?? Infinity)),
      )
      const commonFor = (index: number): number => {
        const own = sourceSizes[index] ?? 0
        const settled = fits
          .filter(
            (fit, other) => fit.inPlace && Math.abs((sourceSizes[other] ?? 0) - own) <= own * 0.1,
          )
          .map((fit) => fit.size)
          .sort((left, right) => left - right)
        return settled[Math.floor(settled.length / 2)] ?? Number.POSITIVE_INFINITY
      }
      runs.forEach((run, index) => {
        const fit = fits[index]
        const elements = run.map((region) => regionElement(container, region))
        const present = elements.filter((element): element is HTMLElement => element !== null)
        if (!fit || fit.size === 0 || present.length !== run.length) return
        flowRun(run, present, Math.min(commonFor(index), fit.size), pageHeight)
        for (const element of present) element.setAttribute("data-overflow", String(!fit.fits))
      })
    }
    // Streaming changes the text many times a second; lay out at most every 200 ms.
    if (trailing.current !== null) window.clearTimeout(trailing.current)
    trailing.current = null
    if (performance.now() - laidOut.current.at > 200) layout()
    else trailing.current = window.setTimeout(layout, 200)
  }, [pageNumber, documentId, containerRef, regions, shape])
}

/**
 * "1. 서론" is the source's own section number, not a Markdown list: kept as text, where the
 * source sets it, instead of an indented list marker.
 */
function literalNumbers(translation: string): string {
  return translation.replace(/^(\s*\d+)\.(?=\s)/gmu, "$1\\.")
}

function regionStyle(region: LayoutRegion): CSSProperties {
  const style: Record<string, string> = {
    left: `${region.rect.x * 100}%`,
    top: `${region.rect.y * 100}%`,
    width: `${region.rect.width * 100}%`,
    height: `${region.rect.height * 100}%`,
  }
  const typography = region.typography
  if (typography) {
    style["--region-line-height"] = String(typography.lineHeight)
    style["--region-indent"] = String(typography.indent)
    style["--region-hang"] = String(typography.hang)
  }
  return style
}

export function PageTranslationLayout({
  documentId,
  page,
  pdfPage = null,
  regions,
}: {
  readonly documentId: DocumentId
  readonly page: number
  readonly pdfPage?: PDFPageProxy | null
  readonly regions: readonly LayoutRegion[]
}): JSX.Element {
  const [font] = useTranslationFont()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const translated = regions.filter((region) => region.translation.length > 0)
  const maskKey = translated.map((region) => region.id).join("|")
  // biome-ignore lint/correctness/useExhaustiveDependencies: masks change only when a region gains its translation
  const masks = useMemo(() => translated.map((region) => region.mask ?? region.rect), [maskKey])
  useMirroredPage(page, pdfPage, canvasRef, containerRef, masks)
  useFittedRegions(page, documentId, containerRef, translated)

  function setActive(region: LayoutRegion, active: boolean): void {
    for (const id of region.blockIds) setPageSourceActive(page, id, active)
  }

  function focusSource(region: LayoutRegion): void {
    const first = region.blockIds[0]
    if (first) focusPageSource(page, first)
  }

  return (
    <div ref={containerRef} className="page-translation-layout" data-font={font}>
      <canvas ref={canvasRef} className="page-translation-layout-canvas" />
      {translated.map((region) => (
        <article
          key={region.id}
          className="page-translation-layout-region"
          data-region-id={region.id}
          data-kind={region.kind}
          data-block-ids={region.blockIds.join(" ")}
          data-bullet={region.typography?.bullet || undefined}
          data-centered={region.typography?.centered || undefined}
          data-serif={region.serif || undefined}
          data-bold={region.bold || undefined}
          data-italic={region.italic || undefined}
          style={regionStyle(region)}
          onMouseEnter={() => setActive(region, true)}
          onMouseLeave={() => setActive(region, false)}
          onClick={(event) => {
            if (event.target instanceof HTMLAnchorElement) return
            focusSource(region)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") focusSource(region)
          }}
        >
          <MarkdownContent
            source={
              region.kind === "equation" ? region.translation : literalNumbers(region.translation)
            }
          />
        </article>
      ))}
    </div>
  )
}
