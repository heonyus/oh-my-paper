import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron as electron, expect, test } from "@playwright/test"

test("production entry fails closed without the account service and exposes no workspace", async ({
  isMobile,
}, testInfo) => {
  expect(isMobile).toBe(false)
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-boundary-"))
  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      OH_MY_PAPER_USER_DATA_DIR: join(root, "profile"),
      OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN: "",
      OH_MY_PAPER_ACCOUNT_ISSUER: "",
      OH_MY_PAPER_GOOGLE_CLIENT_ID: "",
    },
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole("heading", { name: "계정 보안 설정이 필요합니다" })).toBeVisible()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).not.toBeVisible()
    const result = await page.evaluate(async () => {
      try {
        await window.ohmypaper.readWorkspace()
        return "exposed"
      } catch {
        return "denied"
      }
    })
    expect(result).toBe("denied")
    await page.getByRole("button", { name: "도움말", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "로그인과 AI 연결" })).toBeVisible()
    await page.getByRole("button", { name: "닫기", exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath("account-gate.png") })
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
})
