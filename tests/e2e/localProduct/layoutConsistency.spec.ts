import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"
import { seedSixScreenWorkspace } from "./sixScreenWorkflowSetup"

interface LayoutMeasurement {
  readonly file: string
  readonly width: number
  readonly height: number
  readonly documentWidth: number
  readonly navOutside: readonly (string | undefined)[]
  readonly outsideControls: readonly string[]
  readonly clippedControls: readonly {
    readonly text: string | undefined
    readonly className: string
    readonly width: number
    readonly scrollWidth: number
  }[]
}

test("all workspace tabs retain readable bounded controls across appearance sizes", async () => {
  test.setTimeout(180_000)
  const { OH_MY_PAPER_LAYOUT_PHASE: phase = "after" } = process.env
  const output = join(
    process.cwd(),
    "test-results/evidence/ohmypaper-local-product/2026-09-10-layout",
    phase,
  )
  await mkdir(output, { recursive: true })
  const qa = await launchSimulatedAuthenticatedApplication({
    environment: {
      OH_MY_PAPER_QA_SCHOLARLY_FIXTURE: "1",
    },
  })
  const errors: string[] = []
  const measurements: LayoutMeasurement[] = []
  try {
    const page = await qa.application.firstWindow()
    page.on("pageerror", (error) => errors.push(error.message))
    const browserWindow = await qa.application.browserWindow(page)
    await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
    const seeded = await seedSixScreenWorkspace(page)
    await page.getByRole("button", { name: "연결", exact: true }).click()
    await page.getByRole("textbox", { name: "DOI 또는 OpenAlex 주소" }).fill("W100")
    await page.getByRole("button", { name: "논문 그래프 열기", exact: true }).click()
    await expect.poll(() => page.locator(".scholarly-graph-node").count()).toBeGreaterThan(10)
    await page.getByLabel(/^Synthetic study 2:/).click()
    const appearances =
      phase === "before"
        ? [
            { theme: "light", scale: 100, width: 1440, height: 960 },
            { theme: "light", scale: 200, width: 920, height: 640 },
          ]
        : [
            { theme: "light", scale: 100, width: 1440, height: 960 },
            { theme: "dark", scale: 100, width: 1440, height: 960 },
            { theme: "light", scale: 200, width: 920, height: 640 },
            { theme: "dark", scale: 200, width: 920, height: 640 },
            { theme: "light", scale: 50, width: 920, height: 640 },
            { theme: "dark", scale: 50, width: 920, height: 640 },
          ]
    for (const appearance of appearances) {
      await browserWindow.evaluate(
        (window, size) => window.setContentSize(size.width, size.height),
        appearance,
      )
      await page.getByRole("button", { name: "설정", exact: true }).click()
      await page.getByRole("button", { name: "일반", exact: true }).click()
      await page.getByLabel("화면 모드").selectOption(appearance.theme)
      await page.getByRole("button", { name: `${appearance.scale}%`, exact: true }).click()
      await page.getByRole("button", { name: "설정 닫기", exact: true }).click()

      const capture = async (name: string): Promise<void> => {
        await page.evaluate(() => document.fonts.ready)
        const geometry = await page.evaluate(() => {
          const nav = document.querySelector(".research-navigation")
          const navOutside = [...(nav?.querySelectorAll("button") ?? [])]
            .filter((element) => {
              if (!element.checkVisibility({ visibilityProperty: true })) return false
              const bounds = element.getBoundingClientRect()
              return bounds.left < -1 || bounds.right > window.innerWidth + 1
            })
            .map((element) => element.textContent?.trim())
          const clippedControls = [
            ...document.querySelectorAll<HTMLElement>("button, select, label"),
          ]
            .filter((element) => {
              if (
                !element.checkVisibility({ visibilityProperty: true }) ||
                element.closest(".pdfViewer, .board-world, .neighbour-graph-canvas")
              )
                return false
              return element.clientWidth > 2 && element.scrollWidth > element.clientWidth + 2
            })
            .map((element) => ({
              text: element.textContent?.trim().slice(0, 120),
              className: element.className,
              width: element.clientWidth,
              scrollWidth: element.scrollWidth,
            }))
          const scope = document.querySelector('dialog[open], [role="dialog"]') ?? document
          const outsideControls = [...scope.querySelectorAll("input, select, textarea")]
            .filter((element) => {
              if (
                !element.checkVisibility({ visibilityProperty: true }) ||
                element.closest("table, .knowledge-board-canvas, .board-world")
              )
                return false
              const bounds = element.getBoundingClientRect()
              return bounds.width > 0 && (bounds.left < -1 || bounds.right > innerWidth + 1)
            })
            .map((element) => element.getAttribute("aria-label") ?? element.id ?? element.tagName)
          return {
            width: innerWidth,
            height: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            navOutside,
            clippedControls,
            outsideControls,
          }
        })
        const file = `${name}-${appearance.theme}-${appearance.scale}-${appearance.width}.png`
        await page.screenshot({ path: join(output, file), scale: "css" })
        measurements.push({ file, ...geometry })
      }

      for (const name of ["라이브러리", "논문 검색", "지식", "연결", "리더", "비교", "프로젝트"]) {
        await page
          .getByRole("navigation", { name: "주 탐색" })
          .getByRole("button", { name, exact: true })
          .click()
        if (name === "연결") {
          await page.getByRole("button", { name: "논문 그래프", exact: true }).click()
          await page
            .locator(".scholarly-graph")
            .getByRole("button", { name: "그래프 맞춤", exact: true })
            .click()
          await capture("논문 그래프")
          await page.getByRole("button", { name: "내 지식 연결", exact: true }).click()
          await page
            .getByRole("combobox", { name: "기준 노드 선택" })
            .selectOption(seeded.concept.id)
        }
        if (name === "리더")
          await expect(page.locator(".pdfViewer .page canvas").first()).toBeVisible()
        if (name === "비교" && appearance === appearances[0]) {
          for (const id of seeded.paperIds)
            await page.getByRole("combobox", { name: "비교할 노드 추가" }).selectOption(id)
        }
        if (name === "프로젝트")
          await page
            .getByRole("combobox", { name: "프로젝트 보드 선택" })
            .selectOption(seeded.board.id)
        await capture(name)
        if (name === "논문 검색") {
          await page.getByRole("button", { name: "근거 조사", exact: true }).click()
          await capture("근거 조사")
          await page.getByRole("button", { name: "학술 검색", exact: true }).click()
        }
      }
      await page.getByRole("button", { name: "더 보기", exact: true }).click()
      await page.getByRole("button", { name: "메모리", exact: true }).click()
      await capture("메모리")
      await page.getByRole("button", { name: "설정", exact: true }).click()
      for (const name of ["일반", "AI 모델", "읽기"]) {
        await page.getByRole("button", { name, exact: true }).click()
        await capture(`설정-${name}`)
      }
      await page.getByRole("button", { name: "설정 닫기", exact: true }).click()
      for (const name of ["데이터 가져오기·내보내기", "AI 연결 제안"]) {
        await page.getByRole("button", { name: "더 보기", exact: true }).click()
        await page.getByRole("button", { name, exact: true }).click()
        await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible()
        await capture(name)
        await page
          .getByRole("dialog", { name, exact: true })
          .getByRole("button", { name: "닫기", exact: true })
          .click()
      }
    }
    await writeFile(
      join(output, "geometry.json"),
      JSON.stringify({ errors, measurements }, null, 2),
    )
    expect(errors).toEqual([])
    expect(
      measurements.filter(
        (item) =>
          item.documentWidth > item.width + 1 ||
          item.navOutside.length > 0 ||
          item.outsideControls.length > 0,
      ),
    ).toEqual([])
  } finally {
    await qa.close()
  }
})
