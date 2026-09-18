import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

test("Settings confines keyboard focus and Escape returns to its opener", async () => {
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const page = await qa.application.firstWindow()
    const opener = page.getByRole("button", { name: "설정", exact: true })
    await opener.click()
    const dialog = page.getByRole("dialog", { name: "설정" })
    await expect(dialog).toBeVisible()
    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press("Tab")
      await expect
        .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true)
    }
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  } finally {
    await qa.close()
  }
})
