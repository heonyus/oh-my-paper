import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("provider settings show local Paddle without an OCR key", async () => {
  test.setTimeout(120_000)
  const temporaryRoot = await mkdtemp(join(tmpdir(), "scourgify-provider-settings-"))
  const evidenceRoot = join(
    process.cwd(),
    ".omo/evidence/scourgify-local-product/2026-09-21-local-paddle/settings",
  )
  await mkdir(evidenceRoot, { recursive: true })
  const qa = await launchSimulatedAuthenticatedApplication({
    userDataRoot: join(temporaryRoot, "user-data"),
    environment: {
      SCOURGIFY_USER_DATA_DIR: join(temporaryRoot, "user-data"),
      SCOURGIFY_AI_PROVIDER: "gemini",
      SCOURGIFY_AI_MODEL: "gemini-3.5-flash-lite",
    },
  })
  try {
    const page = await qa.application.firstWindow()
    await page.getByRole("button", { name: "설정" }).click()
    await expect(page.getByRole("dialog", { name: "설정" })).toBeVisible()
    await expect(page.getByText("설정 필요", { exact: true })).toBeVisible()
    await page.getByLabel("AI 접근 방식").selectOption("api")
    await expect(page.getByLabel("AI 접근 방식")).toHaveValue("api")
    await page.getByLabel("Provider").selectOption("gemini")
    await expect(page.getByLabel("Provider")).toHaveValue("gemini")
    await expect(page.getByLabel("모델 ID")).toHaveValue("gemini-3.5-flash-lite")
    await page
      .getByRole("textbox", { name: "API 키", exact: true })
      .fill("gemini-e2e-key-at-least-twenty-characters")
    await page.getByRole("button", { name: "암호화하여 저장" }).click()
    await expect(page.getByText("연결 준비됨")).toBeVisible()
    expect(await page.evaluate(() => window.scourgify.documentOcrStatus())).toMatchObject({
      provider: "paddle",
      model: "PaddleOCR-VL-1.6",
    })
    await expect(page.getByLabel(/OCR API 키/)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "OCR 키 저장" })).toHaveCount(0)

    const browserWindow = await qa.application.browserWindow(page)
    const supportedWindowSizes: ReadonlyArray<readonly [number, number]> = [
      [1536, 1024],
      [1280, 800],
      [920, 640],
    ]
    for (const [width, height] of supportedWindowSizes) {
      await browserWindow.evaluate(
        (window, size) => window.setContentSize(size.width, size.height),
        { width, height },
      )
      await expect.poll(async () => page.evaluate(() => window.innerWidth)).toBe(width)
      if (width === 920) {
        await page.getByRole("button", { name: "암호화하여 저장" }).scrollIntoViewIfNeeded()
        await expect(page.getByRole("button", { name: "암호화하여 저장" })).toBeInViewport()
      }
      await page.screenshot({ path: join(evidenceRoot, `settings-${width}x${height}.png`) })
    }
    await page.getByLabel("Provider").selectOption("groq")
    await expect(page.getByLabel("모델 ID")).toHaveValue("openai/gpt-oss-20b")
    await page.getByLabel("모델 ID").selectOption("openai/gpt-oss-120b")
    await expect(page.getByLabel("모델 ID")).toHaveValue("openai/gpt-oss-120b")
    await page.getByLabel("AI 접근 방식").selectOption("chatgpt")
    for (const theme of ["light", "dark"]) {
      for (const scale of [50, 100, 200]) {
        await browserWindow.evaluate((window) => window.setContentSize(1280, 800))
        await page.getByRole("button", { name: "일반", exact: true }).click()
        await page.getByLabel("화면 모드").selectOption(theme)
        await page.getByRole("button", { name: `${scale}%`, exact: true }).click()
        await page.getByRole("button", { name: "AI 모델", exact: true }).click()
        await expect(page.getByLabel(/OCR API 키/)).toHaveCount(0)
        await page.screenshot({ path: join(evidenceRoot, `subscription-${theme}-${scale}.png`) })
      }
      await browserWindow.evaluate((window) => window.setContentSize(920, 640))
      await page.screenshot({ path: join(evidenceRoot, `subscription-${theme}-200-narrow.png`) })
      await page.getByRole("button", { name: "로컬 파일 선택·검증" }).scrollIntoViewIfNeeded()
      await expect(page.getByRole("button", { name: "로컬 파일 선택·검증" })).toBeInViewport()
      await page.screenshot({
        path: join(evidenceRoot, `subscription-${theme}-200-narrow-scrolled.png`),
      })
    }
    await browserWindow.dispose()
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
