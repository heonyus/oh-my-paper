import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

async function expectVisiblePage(page: Page, expected: number): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewport = document.querySelector<HTMLElement>(".board-viewport")
        if (!viewport) return null
        const board = viewport.getBoundingClientRect()
        return (
          [...viewport.querySelectorAll<HTMLElement>(".pdfViewer .page")]
            .map((element) => {
              const rect = element.getBoundingClientRect()
              const width = Math.max(
                0,
                Math.min(board.right, rect.right) - Math.max(board.left, rect.left),
              )
              const height = Math.max(
                0,
                Math.min(board.bottom, rect.bottom) - Math.max(board.top, rect.top),
              )
              return {
                page: Number(element.getAttribute("data-page-number")),
                area: width * height,
              }
            })
            .filter(({ area }) => area > 0)
            .sort((left, right) => right.area - left.area)[0]?.page ?? null
        )
      }),
    )
    .toBe(expected)
}

test("reopens each PDF at its own saved reading page", async () => {
  const root = await mkdtemp(join(tmpdir(), "scourgify-reader-position-e2e-"))
  const userDataRoot = join(root, "user-data")
  const qa = await launchSimulatedAuthenticatedApplication({ userDataRoot })
  let reopened: Awaited<ReturnType<typeof launchSimulatedAuthenticatedApplication>> | null = null

  try {
    const page = await qa.application.firstWindow()
    const documents = await page.evaluate(
      async (paths: readonly string[]) => {
        const imported = []
        for (const path of paths) {
          const result = await window.scourgify.importDocumentPath(path)
          if (!result) throw new Error(`Synthetic PDF import was cancelled: ${path}`)
          imported.push(result.document)
        }
        return imported
      },
      [
        join(process.cwd(), "tests/fixtures/sample-paper.pdf"),
        join(process.cwd(), "tests/fixtures/document-ast/structured-document.pdf"),
      ],
    )
    const first = documents[0]
    const second = documents[1]
    if (!first || !second) throw new Error("Two synthetic PDFs are required")

    await page.reload()
    await page.getByRole("button", { name: `${first.title} 열기`, exact: true }).click()
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible({
      timeout: 30_000,
    })
    const board = page.locator(".board-viewport")
    await board.hover()
    await page.mouse.wheel(0, 900)
    await expectVisiblePage(page, 2)
    await expect
      .poll(async () => {
        const workspace = await page.evaluate(() => window.scourgify.readWorkspace())
        return workspace.documents.find((document) => document.id === first.id)?.lastReadPage
      })
      .toBe(2)

    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await page.getByRole("button", { name: `${second.title} 열기`, exact: true }).click()
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible({
      timeout: 30_000,
    })
    await expectVisiblePage(page, 1)
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await page.getByRole("button", { name: `${first.title} 열기`, exact: true }).click()
    await expect(page.locator('.pdfViewer .page[data-page-number="2"] canvas')).toBeVisible({
      timeout: 30_000,
    })
    await expectVisiblePage(page, 2)

    await qa.close()
    reopened = await launchSimulatedAuthenticatedApplication({ userDataRoot })
    const reopenedPage = await reopened.application.firstWindow()
    await reopenedPage.getByRole("button", { name: `${second.title} 열기`, exact: true }).click()
    await expect(
      reopenedPage.locator('.pdfViewer .page[data-page-number="1"] canvas'),
    ).toBeVisible()
    await expectVisiblePage(reopenedPage, 1)
    await reopenedPage.getByRole("button", { name: "라이브러리", exact: true }).click()
    await reopenedPage.getByRole("button", { name: `${first.title} 열기`, exact: true }).click()
    await expect(
      reopenedPage.locator('.pdfViewer .page[data-page-number="2"] canvas'),
    ).toBeVisible()
    await expectVisiblePage(reopenedPage, 2)
  } finally {
    await reopened?.close()
    if (!reopened) await qa.close()
    await rm(root, { recursive: true, force: true })
  }
})
