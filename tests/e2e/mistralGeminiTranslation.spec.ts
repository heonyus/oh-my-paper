import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron as electron, expect, test } from "@playwright/test"

const { GEMINI_API_KEY: geminiKey, MISTRAL_API_KEY: mistralKey } = process.env

test("Mistral structure and Gemini translation complete on the safe paper fixture", async () => {
  test.skip(!(geminiKey && mistralKey), "requires explicit real-provider QA keys")
  if (!(geminiKey && mistralKey)) return
  test.setTimeout(120_000)
  const temporaryRoot = await mkdtemp(join(tmpdir(), "scourgify-mistral-gemini-e2e-"))
  const evidenceRoot = join(process.cwd(), ".omo", "evidence", "mistral-gemini-translation")
  await mkdir(evidenceRoot, { recursive: true })
  const application = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      SCOURGIFY_USER_DATA_DIR: join(temporaryRoot, "user-data"),
      SCOURGIFY_AI_PROVIDER: "gemini",
      SCOURGIFY_AI_MODEL: "gemini-3.5-flash-lite",
      GEMINI_API_KEY: geminiKey,
      MISTRAL_API_KEY: mistralKey,
    },
  })
  try {
    const page = await application.firstWindow()
    const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
    const imported = await page.evaluate(
      (path) => window.scourgify.importDocumentPath(path),
      fixture,
    )
    expect(imported).not.toBeNull()
    if (!imported) return
    await page.reload()
    await page.getByRole("button", { name: `${imported.document.title} 열기` }).click()
    await page.waitForSelector('.pdfViewer .page[data-page-number="1"] canvas', {
      timeout: 30_000,
    })
    await page.getByRole("button", { name: "번역 모드" }).click()
    const translations = page.locator(".page-translation-block")
    const translationPane = page.getByRole("region", { name: "페이지 번역" })
    await expect
      .poll(
        async () => {
          if ((await translations.count()) > 0) return "translated"
          return translationPane.locator(".page-translation-body").innerText()
        },
        { timeout: 90_000 },
      )
      .toBe("translated")
    expect(await translations.count()).toBeGreaterThan(0)
    await expect(page.getByText("페이지 번역을 완료하지 못했습니다.")).toHaveCount(0)
    await page.locator(".board-viewport").hover({ position: { x: 80, y: 80 } })
    await expect(page.locator(".research-sidebar-flyout")).toHaveCSS("visibility", "hidden")
    await page.screenshot({ path: join(evidenceRoot, "actual.png"), scale: "css" })
  } finally {
    await application.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
