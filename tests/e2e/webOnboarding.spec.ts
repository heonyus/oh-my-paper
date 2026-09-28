import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"

async function openSignedOutHome(page: Page): Promise<void> {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
  await page.goto("http://127.0.0.1:4174/")
  await expect(page.locator(".onboarding-shell")).toBeVisible()
}

test("desktop onboarding identifies the product immediately without a header strip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openSignedOutHome(page)
  const hero = page.getByRole("region", { name: "oh-my-paper" })
  const evidence = join(process.cwd(), ".omo", "evidence", "web-onboarding-final")
  await mkdir(evidence, { recursive: true })

  await expect(page.locator(".onboarding-entry")).toHaveCSS("opacity", "1")
  await expect(page.getByText("번역·메모·인용을 원문 위치와 함께 정리합니다.")).toBeVisible()
  await expect(hero.getByRole("button", { name: "Google로 계속" })).toBeVisible()
  await expect(page.getByRole("banner")).toHaveCount(0)
  await expect(page.locator(".onboarding-brand-mark")).toHaveCSS("overflow", "visible")
  const loadedAssets = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  )
  expect(loadedAssets.some((name) => name.includes("AuthenticatedWorkspace"))).toBe(false)
  await page.screenshot({ path: join(evidence, "desktop.png") })

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280)
})

test("mobile onboarding keeps the brand and login action inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openSignedOutHome(page)
  const hero = page.getByRole("region", { name: "oh-my-paper" })
  await expect(page.locator(".onboarding-entry")).toHaveCSS("opacity", "1")
  const buttonBox = await hero.getByRole("button", { name: "Google로 계속" }).boundingBox()
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44)
  const evidence = join(process.cwd(), ".omo", "evidence", "web-onboarding-final")
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, "mobile.png") })

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
})

test("onboarding introduces the reading workflow as the page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openSignedOutHome(page)
  const evidence = join(process.cwd(), ".omo", "evidence", "web-onboarding-scroll")
  await mkdir(evidence, { recursive: true })

  const chapters = [
    "PDF의 페이지 구성을 유지합니다.",
    "현재 페이지를 문단 단위로 번역합니다.",
    "메모와 인용에 출처 위치를 남깁니다.",
  ]
  for (const [index, chapter] of chapters.entries()) {
    const heading = page.getByRole("heading", { name: chapter })
    await heading.scrollIntoViewIfNeeded()
    await expect(heading).toBeVisible()
    await page.screenshot({ path: join(evidence, `chapter-${index + 1}.png`) })
  }

  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(3_600)
  expect(
    await page
      .locator(".onboarding-story-copy")
      .first()
      .evaluate((element) => {
        return getComputedStyle(element).getPropertyValue("animation-timeline")
      }),
  ).toContain("view")
})
