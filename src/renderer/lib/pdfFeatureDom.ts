import type { PdfFeature, PdfFeatureRect, PdfTextSpan } from "./pdfFeatureDetection"

export function collectPdfTextSpans(pageElement: HTMLElement): readonly PdfTextSpan[] {
  const pageRect = pageElement.getBoundingClientRect()
  return Array.from(pageElement.querySelectorAll<HTMLSpanElement>(".textLayer span")).flatMap(
    (element, index) => {
      const text = element.textContent?.trim() ?? ""
      const rect = element.getBoundingClientRect()
      if (!text || rect.width <= 0 || rect.height <= 0) return []
      const computed = getComputedStyle(element)
      const transform = computed.transform
      const matrix = transform === "none" ? null : new DOMMatrixReadOnly(transform)
      const rotation = matrix ? (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI : 0
      const parsedWeight = Number.parseInt(computed.fontWeight, 10)
      return [
        {
          id: `page-${pageElement.getAttribute("data-page-number") ?? "1"}-span-${index}`,
          text,
          x: rect.left - pageRect.left,
          y: rect.top - pageRect.top,
          width: rect.width,
          height: rect.height,
          fontSize: Number.parseFloat(computed.fontSize) || rect.height,
          fontWeight: Number.isFinite(parsedWeight) ? parsedWeight : 400,
          rotation,
        },
      ]
    },
  )
}

function expandedSearchRect(candidate: PdfFeatureRect, pageWidth: number): PdfFeatureRect {
  const padX = Math.min(8, Math.max(4, candidate.width * 0.03))
  const padTop = Math.min(10, Math.max(4, candidate.height * 0.04))
  const x = Math.max(0, candidate.x - padX)
  const y = Math.max(0, candidate.y - padTop)
  const right = Math.min(pageWidth, candidate.x + candidate.width + padX)
  return { x, y, width: right - x, height: candidate.y + candidate.height - y }
}

export function refineVisualBounds(
  pageElement: HTMLElement,
  candidate: PdfFeatureRect,
): PdfFeatureRect | null {
  const canvas = pageElement.querySelector<HTMLCanvasElement>(".canvasWrapper canvas")
  if (!canvas) return null
  const pageRect = pageElement.getBoundingClientRect()
  const search = expandedSearchRect(candidate, pageRect.width)
  const scaleX = canvas.width / pageRect.width
  const scaleY = canvas.height / pageRect.height
  const x0 = Math.max(0, Math.floor(search.x * scaleX))
  const y0 = Math.max(0, Math.floor(search.y * scaleY))
  const x1 = Math.min(canvas.width, Math.ceil((search.x + search.width) * scaleX))
  const y1 = Math.min(canvas.height, Math.ceil((search.y + search.height) * scaleY))
  if (x1 <= x0 || y1 <= y0) return null
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  const pixels = context.getImageData(x0, y0, x1 - x0, y1 - y0).data
  let minX = x1 - x0
  let minY = y1 - y0
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < y1 - y0; y += 2) {
    for (let x = 0; x < x1 - x0; x += 2) {
      const index = (y * (x1 - x0) + x) * 4
      const red = pixels[index] ?? 255
      const green = pixels[index + 1] ?? 255
      const blue = pixels[index + 2] ?? 255
      if (
        Math.min(red, green, blue) >= 250 &&
        Math.max(red, green, blue) - Math.min(red, green, blue) < 6
      )
        continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  const top = search.y + minY / scaleY
  const bottom = Math.min(candidate.y + candidate.height, search.y + (maxY + 2) / scaleY)
  return {
    x: search.x + minX / scaleX,
    y: top,
    width: (maxX - minX + 2) / scaleX,
    height: Math.max(20, bottom - top),
  }
}

export function adoptVisualBounds(
  pageElement: HTMLElement,
  candidate: PdfFeatureRect,
): PdfFeatureRect {
  const refined = refineVisualBounds(pageElement, candidate)
  if (!refined) return candidate
  const candidateArea = candidate.width * candidate.height
  const refinedArea = refined.width * refined.height
  if (refined.width < 24 || refined.height < 16 || refinedArea < candidateArea * 0.2)
    return candidate
  return refined
}

export function cropFeatureImage(pageElement: HTMLElement, feature: PdfFeature): string | null {
  const source = pageElement.querySelector<HTMLCanvasElement>(".canvasWrapper canvas")
  if (!source) return null
  const pageRect = pageElement.getBoundingClientRect()
  const scaleX = source.width / pageRect.width
  const scaleY = source.height / pageRect.height
  const x = Math.max(0, Math.floor(feature.rect.x * scaleX))
  const y = Math.max(0, Math.floor(feature.rect.y * scaleY))
  const width = Math.min(source.width - x, Math.ceil(feature.rect.width * scaleX))
  const height = Math.min(source.height - y, Math.ceil(feature.rect.height * scaleY))
  if (width <= 1 || height <= 1) return null
  const target = document.createElement("canvas")
  target.width = width
  target.height = height
  const context = target.getContext("2d")
  if (!context) return null
  context.drawImage(source, x, y, width, height, 0, 0, width, height)
  return target.toDataURL("image/png")
}
