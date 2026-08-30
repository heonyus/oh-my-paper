export const pdfCanvasPixelBudget = 32 * 1024 * 1024
export const pdfCanvasDimensionLimit = 16_384

export function alignedDevicePixel(value: number, pixelRatio: number): number {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  return Math.round(value * ratio) / ratio
}
