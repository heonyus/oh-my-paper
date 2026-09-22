import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("fresh profile exposes the knowledge destinations and separate AI modes", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-refactor-integration-"))
  const qa = await launchSimulatedAuthenticatedApplication({
    userDataRoot: join(temporaryRoot, "user-data"),
    environment: {
      OH_MY_PAPER_PADDLE_VL_READY: join(temporaryRoot, "missing-paddle-runtime"),
    },
  })
  try {
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    for (const [label, marker] of [
      ["지식", ".knowledge-shell"],
      ["연결", "연결"],
      ["비교", "근거 비교"],
      ["프로젝트", "프로젝트"],
    ] as const) {
      await page.getByRole("button", { name: label, exact: true }).click()
      if (marker.startsWith(".")) await expect(page.locator(marker)).toBeVisible()
      else await expect(page.getByRole("heading", { name: marker, exact: true })).toBeVisible()
    }

    await page.getByRole("button", { name: "설정" }).click()
    await page.getByLabel("AI 접근 방식").selectOption("chatgpt")
    await expect(page.getByRole("region", { name: "ChatGPT 구독" })).toBeVisible()
    await page.getByRole("button", { name: "구독 연결 사용" }).click()
    await page.getByLabel("AI 접근 방식").selectOption("api")
    await page.getByLabel("Provider").selectOption("opencodex")
    await expect(page.locator("#provider-key")).not.toBeVisible()
    await page.getByRole("button", { name: "암호화하여 저장" }).click()
    await expect
      .poll(async () => page.evaluate(() => window.ohmypaper.providerStatus()))
      .toMatchObject({ mode: "api", provider: "opencodex" })
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
