import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

test("appearance settings preserve chrome states and narrow settings scrolling", async ({
  isMobile,
}, testInfo) => {
  expect(isMobile).toBe(false)
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const page = await qa.application.firstWindow()
    const browserWindow = await qa.application.browserWindow(page)
    await page.getByRole("button", { name: "설정" }).click()
    await page.getByRole("button", { name: "일반" }).click()
    const settingsPage = page.locator(".settings-page")
    const appShell = page.locator(".app-shell")

    await page.selectOption("#appearance-theme", "light")
    await page.locator(".settings-font-option").filter({ hasText: "Pretendard" }).click()
    await page
      .locator(".settings-font-option")
      .filter({ hasText: "Geist 영문 + Wanted Sans 한글" })
      .click()
    await page.getByRole("button", { name: "200%" }).click()
    await expect(appShell).toHaveAttribute("data-theme", "light")
    await expect
      .poll(() =>
        appShell.evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--type-body-size"),
        ),
      )
      .toBe("28px")
    await expect
      .poll(() => appShell.evaluate((element) => getComputedStyle(element).fontFamily))
      .toContain("Geist Variable")
    await page.screenshot({ path: testInfo.outputPath("appearance-light.png") })

    await page.selectOption("#appearance-theme", "dark")
    await expect(appShell).toHaveAttribute("data-theme", "dark")
    await page.screenshot({ path: testInfo.outputPath("appearance-dark.png") })

    await browserWindow.evaluate((window, size) => window.setContentSize(size.width, size.height), {
      width: 920,
      height: 640,
    })
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(920)
    await settingsPage.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect
      .poll(() => settingsPage.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath("appearance-narrow-dark.png") })
  } finally {
    await qa.close()
  }
})
