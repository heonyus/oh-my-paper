import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("font settings show every loaded family as a distinct specimen", async () => {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-font-settings-"))
  const qa = await launchSimulatedAuthenticatedApplication({ userDataRoot: root })
  try {
    const page = await qa.application.firstWindow()
    await page.getByRole("button", { name: "설정" }).click()
    await page.getByRole("button", { name: "일반" }).click()
    await page.evaluate(() => document.fonts.ready)
    const faces = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => /Wanted|Pretendard|SUIT|Geist/u.test(face.family))
        .map((face) => ({ family: face.family, status: face.status })),
    )
    expect(faces).toEqual(
      expect.arrayContaining([
        { family: "Wanted Sans Variable", status: "loaded" },
        { family: "Pretendard Variable", status: "loaded" },
        { family: "SUIT Variable", status: "loaded" },
        { family: "Geist Variable", status: "loaded" },
      ]),
    )
    await expect(page.locator(".settings-font-option")).toHaveCount(5)
    const optionFamilies = await page
      .locator(".settings-font-option")
      .evaluateAll((options) => options.map((option) => getComputedStyle(option).fontFamily))
    expect(new Set(optionFamilies).size).toBe(5)
    await expect(page.getByRole("button", { name: "100%로 초기화" })).toHaveCount(0)
    const evidence = join(process.cwd(), ".omo", "evidence", "font-settings")
    await mkdir(evidence, { recursive: true })
    await page.screenshot({ path: join(evidence, "actual.png") })
  } finally {
    await qa.close()
    await rm(root, { recursive: true, force: true })
  }
})
