import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"
import { setTheme } from "./sixScreenWorkflowHelpers"

test("paper graph traverses real IPC and HTTP adapter with bounded fixture metadata", async () => {
  // Given: only the external HTTP provider is simulated; main validation and local persistence run.
  const qa = await launchSimulatedAuthenticatedApplication({
    environment: { OH_MY_PAPER_QA_SCHOLARLY_FIXTURE: "1" },
  })
  const output = join(
    process.cwd(),
    "test-results/evidence/ohmypaper-local-product/2026-09-08-paper-graph",
  )
  await mkdir(output, { recursive: true })
  try {
    const page = await qa.application.firstWindow()
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const browserWindow = await qa.application.browserWindow(page)
    await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
    await page.getByRole("button", { name: "연결", exact: true }).click()
    const seed = page.getByRole("textbox", { name: "DOI 또는 OpenAlex 주소" })
    await seed.fill("not a paper")
    await page.getByRole("button", { name: "논문 그래프 열기" }).click()
    await expect(page.getByRole("alert")).toContainText("DOI")
    await seed.fill("W100")

    // When
    await page.getByRole("button", { name: "논문 그래프 열기" }).click()
    const graph = page.locator(".scholarly-graph")
    const nodes = graph.locator(".scholarly-graph-node")
    await expect.poll(() => nodes.count()).toBeGreaterThan(10)
    const initialCount = await nodes.count()
    await graph.getByLabel(/^Synthetic study 2:/).click()
    const detail = graph.getByRole("complementary", { name: "선택한 논문 상세" })
    await expect(detail.getByRole("heading", { level: 2 })).toContainText("Synthetic study 2:")
    await detail.getByRole("button", { name: "참고문헌", exact: true }).click()
    await expect(nodes).toHaveCount(2)
    await graph.getByRole("button", { name: "이전", exact: true }).click()

    // Then: both graph and selection restore, not just a stale selected identifier.
    await expect(nodes).toHaveCount(initialCount)
    await expect(detail.getByRole("heading", { level: 2 })).toContainText("Synthetic study 2:")
    await graph.getByRole("button", { name: "다음", exact: true }).click()
    await expect(nodes).toHaveCount(2)
    await detail.getByRole("button", { name: "피인용", exact: true }).click()
    await expect.poll(() => nodes.count()).toBeGreaterThan(2)
    await detail.getByRole("button", { name: "관련", exact: true }).click()
    await expect(nodes).toHaveCount(9)
    await detail.getByRole("button", { name: "라이브러리에 저장", exact: true }).click()
    await expect(detail.getByRole("button", { name: "저장됨", exact: true })).toBeVisible()
    await expect(graph).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const saved = await window.ohmypaper.knowledge.findNodes({ search: "Synthetic study 2:" })
          return saved.filter((node) => node.kind === "paper").length
        }),
      )
      .toBe(1)
    const canvas = graph.locator("svg > g").first()
    const stage = await graph.locator(".scholarly-graph-stage").boundingBox()
    if (!stage) throw new Error("Graph stage is not visible")
    const beforePan = await canvas.getAttribute("transform")
    await page.mouse.move(stage.x + 100, stage.y + 40)
    await page.mouse.down()
    await page.mouse.move(stage.x + 170, stage.y + 80, { steps: 5 })
    await page.mouse.up()
    await expect(canvas).not.toHaveAttribute("transform", beforePan ?? "")
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("")
    const beforeWheel = await canvas.getAttribute("transform")
    await page.mouse.wheel(0, -120)
    await expect(canvas).not.toHaveAttribute("transform", beforeWheel ?? "")
    const before = await canvas.getAttribute("transform")
    await graph.getByRole("button", { name: "확대", exact: true }).click()
    await expect(canvas).not.toHaveAttribute("transform", before ?? "")
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await page.getByRole("button", { name: "연결", exact: true }).click()
    await expect(nodes).toHaveCount(9)
    await graph.getByRole("button", { name: "그래프 맞춤", exact: true }).click()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await page.screenshot({ path: join(output, `paper-graph-${theme}-1440.png`), scale: "css" })
    }
    await browserWindow.evaluate((window) => window.setContentSize(920, 720))
    await graph.getByRole("button", { name: "그래프 맞춤", exact: true }).click()
    await page.screenshot({ path: join(output, "paper-graph-dark-920.png"), scale: "css" })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    expect(errors).toEqual([])
    await page.reload()
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const saved = await window.ohmypaper.knowledge.findNodes({ search: "Synthetic study 2:" })
          return saved.filter((node) => node.kind === "paper").length
        }),
      )
      .toBe(1)
  } finally {
    await qa.close()
  }
})
