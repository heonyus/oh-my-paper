import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron as electron, expect, test } from "@playwright/test"

const {
  OH_MY_PAPER_MINERU_COMMAND: mineruCommand,
  OH_MY_PAPER_E2E_EXECUTABLE: packagedExecutable,
  OH_MY_PAPER_E2E_OPENAI_KEY: openaiKey,
} = process.env

test("MinerU paragraphs map to translated cards without visual blocks", async () => {
  test.skip(!mineruCommand, "requires the managed MinerU runtime")
  test.skip(!openaiKey, "requires OH_MY_PAPER_E2E_OPENAI_KEY for AI translation")
  if (!mineruCommand || !openaiKey) return
  test.setTimeout(120_000)
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-mineru-translation-e2e-"))
  const evidenceDirectory = join(process.cwd(), ".omo", "evidence", "mineru-page-translation")
  await mkdir(evidenceDirectory, { recursive: true })
  const application = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : { args: ["."] }),
    env: {
      ...process.env,
      OH_MY_PAPER_USER_DATA_DIR: join(temporaryRoot, "user-data"),
      OH_MY_PAPER_MINERU_COMMAND: mineruCommand,
    },
  })
  try {
    const page = await application.firstWindow()
    await page.evaluate(
      (key) =>
        window.ohmypaper.saveProviderConfig({ provider: "openai", apiKey: key, model: "gpt-5" }),
      openaiKey,
    )
    const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
    const imported = await page.evaluate(async (path) => {
      const imported = await window.ohmypaper.importDocumentPath(path)
      if (!imported) return null
      const workspace = await window.ohmypaper.readWorkspace()
      await window.ohmypaper.saveWorkspace({
        ...workspace,
        activeDocumentId: imported.document.id,
      })
      return { id: imported.document.id, title: imported.document.title }
    }, fixture)
    expect(imported).not.toBeNull()
    if (!imported) return
    const layout = await page.evaluate((id) => window.ohmypaper.readDocumentLayout(id), imported.id)
    expect(layout).toMatchObject({
      status: "ready",
      layout: { version: 3, model: "MinerU2.5-Pro-2605-1.2B" },
    })
    await page.reload()
    const libraryItem = page.getByRole("button", { name: `${imported.title} 열기` })
    await expect(libraryItem).toBeVisible({ timeout: 15_000 })
    await libraryItem.click()
    await page.waitForSelector('.pdfViewer .page[data-page-number="1"] canvas', {
      timeout: 30_000,
    })
    await page.getByRole("button", { name: "번역 모드" }).click()
    const translated = page.locator(".page-translation-block")
    await expect(translated.first()).toBeVisible({ timeout: 45_000 })
    expect(await translated.count()).toBeGreaterThan(0)
    expect(await translated.allTextContents()).not.toContain(
      expect.stringMatching(/^Figure|^Table/iu),
    )
    const firstId = await translated.first().getAttribute("data-block-id")
    expect(firstId).not.toBeNull()
    expect(
      await page.locator(`[data-page-translation-block="${firstId}"]`).count(),
    ).toBeGreaterThan(0)
    await translated.first().hover()
    await expect(
      page.locator(`[data-page-translation-block="${firstId}"]`).first(),
    ).toHaveAttribute("data-page-translation-active", "true")
    await page.screenshot({ path: join(evidenceDirectory, "actual.png"), scale: "css" })
  } finally {
    await application.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
