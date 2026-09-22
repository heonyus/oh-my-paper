import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"
import { setTheme } from "./sixScreenWorkflowHelpers"
import { seedSixScreenWorkspace } from "./sixScreenWorkflowSetup"

test("research navigation preserves library context and keeps secondary tools reachable", async () => {
  const qa = await launchSimulatedAuthenticatedApplication()
  const output = join(process.cwd(), ".omo/evidence/ohmypaper-local-product/2026-09-08-paper-graph")
  await mkdir(output, { recursive: true })
  try {
    const page = await qa.application.firstWindow()
    const browserWindow = await qa.application.browserWindow(page)
    await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
    const seeded = await seedSixScreenWorkspace(page)
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    const query = page.getByRole("searchbox", { name: "라이브러리 검색" })
    await query.fill("oh-my-paper")
    await page.getByRole("button", { name: "지식", exact: true }).click()
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await expect(query).toHaveValue("oh-my-paper")
    await query.clear()
    await page
      .getByRole("button", { name: `${seeded.documents[0].title} 미리보기`, exact: true })
      .click()
    await expect(page.getByRole("region", { name: "문서 상세", exact: true })).toContainText(
      seeded.documents[0].title,
    )
    await page.getByRole("button", { name: "지식으로 연결", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: seeded.documents[0].title, exact: true }),
    ).toBeVisible()
    await page.getByRole("button", { name: "지식 목록 접기", exact: true }).click()
    await expect(page.getByRole("button", { name: "지식 목록 펼치기", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "지식 목록 펼치기", exact: true }).click()
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await page.getByRole("button", { name: "컬렉션 사이드바 접기", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "컬렉션 사이드바 열기", exact: true }),
    ).toBeVisible()
    await page.getByRole("button", { name: "컬렉션 사이드바 열기", exact: true }).click()
    await page.getByRole("button", { name: "더 보기", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "데이터 가져오기·내보내기", exact: true }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.locator(".research-navigation-menu")).toBeHidden()
    await page.getByRole("button", { name: "컬렉션 만들기", exact: true }).click()
    await page
      .getByRole("textbox", { name: "새 컬렉션 이름", exact: true })
      .fill("읽기와 근거 연결")
    await page.getByRole("button", { name: "만들기", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: "이 컬렉션은 비어 있습니다", exact: true }),
    ).toBeVisible()
    await page.getByRole("button", { name: /^전체 문서/ }).click()
    await page
      .getByRole("button", { name: `${seeded.documents[0].title} 미리보기`, exact: true })
      .click()
    const membership = page
      .getByRole("region", { name: "문서 상세", exact: true })
      .getByRole("button", { name: "읽기와 근거 연결 추가", exact: true })
    await membership.click()
    await expect(
      page
        .getByRole("region", { name: "문서 상세", exact: true })
        .getByRole("button", { name: "읽기와 근거 연결 담김", exact: true }),
    ).toHaveAttribute("aria-pressed", "true")
    await page.reload()
    const collection = page
      .getByRole("complementary", { name: "라이브러리 탐색" })
      .getByRole("button", { name: /^읽기와 근거 연결/ })
    await collection.click()
    await expect(page.getByRole("region", { name: "문서 결과", exact: true })).toContainText(
      "1개 문서",
    )
    await expect(page.getByRole("region", { name: "문서 결과", exact: true })).toContainText(
      seeded.documents[0].title,
    )
    await page.getByRole("button", { name: "프로젝트", exact: true }).click()
    await page
      .getByRole("combobox", { name: "프로젝트 보드 선택" })
      .selectOption({ label: "읽기와 근거 연결" })
    await expect(page.getByRole("region", { name: "프로젝트 보드 배치 영역" })).toContainText(
      seeded.documents[0].title,
    )
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await page.getByRole("button", { name: /^전체 문서/ }).click()
    await expect(
      page.getByText("저장한 논문을 불러오지 못했습니다. 다시 시도하세요.", { exact: true }),
    ).toBeHidden()
    await page.getByRole("button", { name: "프로젝트", exact: true }).click()
    await expect(
      page.getByRole("combobox", { name: "프로젝트 보드 선택" }).locator("option:checked"),
    ).toHaveText("읽기와 근거 연결")
    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    for (const width of [1440, 920]) {
      await browserWindow.evaluate((window, next) => window.setContentSize(next, 960), width)
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme)
        await page.screenshot({ path: join(output, `library-${theme}-${width}.png`), scale: "css" })
        if (width === 1440 && theme === "light") {
          await page.getByRole("button", { name: "컬렉션 사이드바 접기", exact: true }).click()
          await page.screenshot({
            path: join(output, "library-collapsed-light-1440.png"),
            scale: "css",
          })
          await page.getByRole("button", { name: "컬렉션 사이드바 열기", exact: true }).click()
        }
        await expect(page.locator(".app-shell")).toHaveAttribute("data-navigation", "research")
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          )
          .toBe(true)
      }
    }
    await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
    await page.getByRole("button", { name: "연결", exact: true }).click()
    await page.getByRole("button", { name: "내 지식 연결", exact: true }).click()
    await page.getByRole("combobox", { name: "기준 노드 선택" }).selectOption(seeded.concept.id)
    const graph = page.getByRole("region", { name: "이웃 관계 시각화" })
    await expect(graph).toBeVisible()
    await page.getByRole("button", { name: "연결 목록 접기", exact: true }).click()
    await expect(page.getByRole("button", { name: "연결 목록 펼치기", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "연결 목록 펼치기", exact: true }).click()
    const beforeZoom = await graph.locator(".neighbour-graph-canvas").getAttribute("style")
    await page.getByRole("button", { name: "그래프 확대", exact: true }).click()
    await expect(graph.locator(".neighbour-graph-canvas")).not.toHaveAttribute(
      "style",
      beforeZoom ?? "",
    )
    await page.getByRole("button", { name: "그래프 맞춤", exact: true }).click()
    await graph.locator(".neighbour-graph-node").filter({ hasText: seeded.note.title }).click()
    await expect(page.getByRole("complementary", { name: "선택한 항목 상세" })).toContainText(
      seeded.note.title,
    )
    await expect(graph).toBeVisible()
    await page.getByRole("button", { name: "이 항목 주변 탐색", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "기준 노드 선택" })).toHaveValue(seeded.note.id)
    await page.getByRole("button", { name: "이전 그래프", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "기준 노드 선택" })).toHaveValue(
      seeded.concept.id,
    )
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await page.getByRole("button", { name: "그래프 맞춤", exact: true }).click()
      await page.screenshot({ path: join(output, `graph-${theme}-1440.png`), scale: "css" })
    }
    await expect(page.getByRole("button", { name: "현재 탐색 기준", exact: true })).toBeDisabled()
  } finally {
    await qa.close()
  }
})
