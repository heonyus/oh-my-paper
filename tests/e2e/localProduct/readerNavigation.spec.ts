import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"
import { setTheme } from "./sixScreenWorkflowHelpers"

test("Reader keeps global navigation and identifies the retained paper", async () => {
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const page = await qa.application.firstWindow()
    const browserWindow = await qa.application.browserWindow(page)
    await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
    const output = join(
      process.cwd(),
      "test-results/evidence/ohmypaper-local-product/2026-09-08-reader-navigation",
    )
    await mkdir(output, { recursive: true })
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await page.getByRole("button", { name: "리더", exact: true }).click()
    await expect(page.getByRole("heading", { name: "열린 논문이 없습니다" })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "읽는 논문" })).toBeDisabled()
    await page.screenshot({ path: join(output, "reader-empty.png"), scale: "css" })
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    const otherDocument = await page.evaluate(
      async (path) => {
        const result = await window.ohmypaper.importDocumentPath(path)
        if (!result) throw new Error("Synthetic PDF import was cancelled")
        return result.document
      },
      join(process.cwd(), "tests/fixtures/document-ast/structured-document.pdf"),
    )
    const document = await page.evaluate(
      async (path) => {
        const result = await window.ohmypaper.importDocumentPath(path)
        if (!result) throw new Error("Synthetic PDF import was cancelled")
        return result.document
      },
      join(process.cwd(), "tests/fixtures/sample-paper.pdf"),
    )
    await page.reload()
    const navigation = page.getByRole("navigation", { name: "주 탐색" })
    const before = await navigation.boundingBox()
    const labels = await navigation.getByRole("button").allTextContents()
    await page.screenshot({ path: join(output, "library-before-reader.png"), scale: "css" })
    await page.getByRole("button", { name: "리더", exact: true }).click()
    expect(await navigation.getByRole("button").allTextContents()).toEqual(labels)
    expect(await navigation.boundingBox()).toEqual(before)
    await expect(page.getByRole("combobox", { name: "읽는 논문" })).toHaveValue(document.id)
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible()
    await page.getByRole("button", { name: "목차 열기", exact: true }).click()
    await expect(page.locator(".outline-panel li").first()).toBeVisible()
    const text = page.locator('.pdfViewer .page[data-page-number="1"] .textLayer span').first()
    await expect(text).toBeVisible()
    await text.evaluate((element) => {
      const range = window.document.createRange()
      range.selectNodeContents(element)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      window.document.dispatchEvent(new Event("selectionchange"))
    })
    await expect(page.getByRole("toolbar", { name: "선택 작업" })).toBeVisible()
    const transition = await page.getByRole("combobox", { name: "읽는 논문" }).evaluate(
      (element, next) =>
        new Promise<{ menu: boolean; outline: number }>((resolve) => {
          if (!(element instanceof HTMLSelectElement)) throw new Error("Paper selector is missing")
          const observer = new MutationObserver(() => {
            if (
              window.document
                .querySelector(".board-viewport")
                ?.getAttribute("data-document-hash") !== next.hash
            )
              return
            observer.disconnect()
            resolve({
              menu: Boolean(window.document.querySelector(".selection-menu")),
              outline: window.document.querySelectorAll(".outline-panel li").length,
            })
          })
          observer.observe(window.document.body, {
            childList: true,
            subtree: true,
            attributes: true,
          })
          element.value = next.id
          element.dispatchEvent(new Event("change", { bubbles: true }))
        }),
      otherDocument,
    )
    expect(transition).toEqual({ menu: false, outline: 0 })
    await expect(page.locator(".board-viewport")).toHaveAttribute(
      "data-document-hash",
      otherDocument.hash,
    )
    await page.getByRole("button", { name: "목차 닫기", exact: true }).first().click()
    await page.getByRole("combobox", { name: "읽는 논문" }).selectOption(document.id)
    await expect(page.locator(".board-viewport")).toHaveAttribute(
      "data-document-hash",
      document.hash,
    )
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible()
    await page.getByRole("button", { name: "목차 열기", exact: true }).click()
    await expect(page.locator(".outline-panel")).toBeVisible()
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible()
    await page.screenshot({ path: join(output, "reader-outline.png"), scale: "css" })
    await page.getByRole("button", { name: "목차 닫기", exact: true }).first().click()
    for (const width of [1440, 920]) {
      await browserWindow.evaluate((window, width) => window.setContentSize(width, 960), width)
      await page.getByRole("button", { name: "첫 페이지로", exact: true }).click()
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme)
        for (const scale of [50, 100, 200]) {
          await page.getByRole("button", { name: "설정", exact: true }).click()
          await page.getByRole("button", { name: "일반", exact: true }).click()
          await page.getByRole("button", { name: `${scale}%`, exact: true }).click()
          await page.getByRole("button", { name: "설정 닫기", exact: true }).click()
          await expect(page.getByRole("combobox", { name: "읽는 논문" })).toHaveValue(document.id)
          await expect(page.getByRole("button", { name: "리더", exact: true })).toHaveAttribute(
            "aria-current",
            "page",
          )
          expect(
            await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true)
          await page.screenshot({
            path: join(output, `reader-${theme}-${width}-${scale}.png`),
            scale: "css",
          })
        }
      }
    }
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toHaveCount(0)
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await page.getByRole("button", { name: "지식", exact: true }).click()
    await page.getByRole("button", { name: "더 보기", exact: true }).click()
    await page.getByRole("button", { name: "메모리", exact: true }).click()
    await expect(page.getByRole("button", { name: "더 보기", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    )
    await page.getByRole("button", { name: "리더", exact: true }).click()
    await expect(page.locator(".board-viewport")).toHaveAttribute(
      "data-document-hash",
      document.hash,
    )
  } finally {
    await qa.close()
  }
})
