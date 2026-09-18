import { expect, type Page } from "@playwright/test"

export interface MeasuredSourceAnchor {
  readonly page: number
  readonly quote: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly fragments: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }[]
}

export async function measureSourceAnchor(page: Page, text: string): Promise<MeasuredSourceAnchor> {
  const span = page.locator(".pdfViewer .page .textLayer span").filter({ hasText: text }).first()
  await expect(span).toBeVisible({ timeout: 30_000 })
  return span.evaluate((element) => {
    const pageElement = element.closest<HTMLElement>(".page")
    const board = document.querySelector<HTMLElement>(".board-viewport")
    const world = document.querySelector<HTMLElement>(".board-world")
    if (!pageElement || !board || !world) throw new Error("PDF board geometry is unavailable")
    const rect = element.getBoundingClientRect()
    const origin = board.getBoundingClientRect()
    const matrix = new DOMMatrix(getComputedStyle(world).transform)
    const scaleX = matrix.a || 1
    const scaleY = matrix.d || 1
    const x = (rect.x - origin.x - matrix.e) / scaleX
    const y = (rect.y - origin.y - matrix.f) / scaleY
    const width = rect.width / scaleX
    const height = rect.height / scaleY
    return {
      page: Number(pageElement.getAttribute("data-page-number") ?? "1"),
      quote: element.textContent?.trim() ?? "",
      x,
      y,
      width,
      height,
      fragments: [{ x, y, width, height }],
    }
  })
}

export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  const shell = page.locator(".app-shell")
  if ((await shell.getAttribute("data-theme")) === theme) return
  await page.getByRole("button", { name: "설정", exact: true }).click()
  await page.getByRole("button", { name: "일반", exact: true }).click()
  await page.selectOption("#appearance-theme", theme)
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click()
  await expect(shell).toHaveAttribute("data-theme", theme)
}

export async function captureView(
  page: Page,
  evidenceRoot: string,
  name: string,
  open: () => Promise<void>,
): Promise<void> {
  await open()
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    await page.screenshot({
      path: `${evidenceRoot}/${name}-${theme}-1440x960.png`,
      scale: "css",
    })
  }
}
