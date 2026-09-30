import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"
import { captureView, setTheme } from "./sixScreenWorkflowHelpers"
import {
  seedSixScreenWorkspace,
  sixScreenConceptTitle,
  sixScreenNoteTitle,
} from "./sixScreenWorkflowSetup"

test("simulated-auth six-screen research workflow persists shared evidence and placements", async ({
  isMobile,
}) => {
  expect(isMobile).toBe(false)
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-six-screen-"))
  const userDataRoot = join(temporaryRoot, "user-data")
  const evidenceRoot = join(
    process.cwd(),
    "test-results",
    "evidence",
    "ohmypaper-local-product",
    "2026-09-08-paper-graph",
  )
  await mkdir(evidenceRoot, { recursive: true })
  const pageErrors: string[] = []
  const reopenedPageErrors: string[] = []
  const qa = await launchSimulatedAuthenticatedApplication({ userDataRoot })
  let reopened: Awaited<ReturnType<typeof launchSimulatedAuthenticatedApplication>> | null = null
  let initialClosed = false

  try {
    const page = await qa.application.firstWindow()
    page.on("pageerror", (error) => pageErrors.push(error.message))
    expect(qa.authMode).toBe("simulated-auth-not-live-google")
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()

    const seeded = await seedSixScreenWorkspace(page)
    const [firstDocument, secondDocument] = seeded.documents
    const { board, concept, firstAnchor, note, noteBody, paperIds, placements } = seeded

    const browserWindow = await qa.application.browserWindow(page)
    await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1440)
    await captureView(page, evidenceRoot, "library", async () => {
      await page.getByRole("button", { name: "라이브러리", exact: true }).click()
      await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    })
    await captureView(page, evidenceRoot, "reader", async () => {
      await page.getByRole("button", { name: `${firstDocument.title} 열기`, exact: true }).click()
      await expect(page.locator(".board-viewport")).toBeVisible()
      await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible({
        timeout: 30_000,
      })
    })
    await captureView(page, evidenceRoot, "knowledge", async () => {
      await page.getByRole("button", { name: "지식", exact: true }).click()
      await expect(page.getByRole("region", { name: "지식 항목 목록" })).toBeVisible()
      await page.locator(".knowledge-item-btn").filter({ hasText: sixScreenConceptTitle }).click()
      await expect(
        page.getByRole("heading", { name: sixScreenConceptTitle, exact: true }),
      ).toBeVisible()
    })

    await page.locator(".knowledge-item-btn").filter({ hasText: sixScreenNoteTitle }).click()
    await expect(page.getByRole("textbox", { name: "본문 내용 수정" })).toBeVisible()
    await setTheme(page, "light")
    await page.screenshot({
      path: join(evidenceRoot, "note-editor-light-1440x960.png"),
      scale: "css",
    })
    await setTheme(page, "dark")
    await page.screenshot({
      path: join(evidenceRoot, "note-editor-dark-1440x960.png"),
      scale: "css",
    })
    await page.locator(".knowledge-item-btn").filter({ hasText: sixScreenConceptTitle }).click()
    await expect(
      page.getByRole("heading", { name: sixScreenConceptTitle, exact: true }),
    ).toBeVisible()

    const sourceLink = page.locator(".knowledge-relation .knowledge-link").filter({
      hasText: firstAnchor.quote,
    })
    await expect(sourceLink).toBeVisible()
    await sourceLink.click()
    await expect(page.locator(".board-viewport")).toHaveAttribute(
      "data-document-hash",
      firstDocument.hash,
    )
    await expect(
      page.getByText(`${firstAnchor.page}페이지 · 연결된 원문 구절`, { exact: true }),
    ).toBeVisible()
    await expect(page.locator(".board-world .source-highlight")).toHaveCount(1)
    await page.getByRole("button", { name: "표시 닫기", exact: true }).click()

    await captureView(page, evidenceRoot, "graph", async () => {
      await page.getByRole("button", { name: "연결", exact: true }).click()
      await page.getByRole("button", { name: "내 지식 연결", exact: true }).click()
      await expect(page.getByRole("heading", { name: "연결", exact: true })).toBeVisible()
      await expect(
        page.getByRole("button", { name: sixScreenConceptTitle, exact: false }),
      ).toBeVisible()
    })
    await captureView(page, evidenceRoot, "compare", async () => {
      await page.getByRole("button", { name: "비교", exact: true }).click()
      await expect(page.getByRole("heading", { name: "연구 조건 비교", exact: true })).toBeVisible()
      const select = page.getByRole("combobox", { name: "비교할 노드 추가" })
      await select.selectOption(paperIds[0] ?? "")
      await select.selectOption(paperIds[1] ?? "")
      await expect(page.getByRole("table")).toContainText("원문 증거")
    })
    await captureView(page, evidenceRoot, "project", async () => {
      await page.getByRole("button", { name: "프로젝트", exact: true }).click()
      await expect(page.getByRole("heading", { name: "프로젝트", exact: true })).toBeVisible()
      await page.getByRole("combobox", { name: "프로젝트 보드 선택" }).selectOption(board.id)
      await expect(page.getByRole("region", { name: "프로젝트 보드 배치 영역" })).toContainText(
        sixScreenConceptTitle,
      )
      await expect(page.getByRole("region", { name: "프로젝트 보드 배치 영역" })).toContainText(
        sixScreenNoteTitle,
      )
    })

    await browserWindow.evaluate((window) => window.setContentSize(920, 640))
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(920)
    await page.getByRole("button", { name: "설정", exact: true }).click()
    await page.getByRole("button", { name: "일반", exact: true }).click()
    const settings = page.locator(".settings-page")
    const settingsDialog = page.getByRole("dialog")
    await expect(settingsDialog).toBeVisible()
    await page.getByRole("button", { name: "100%", exact: true }).click()
    await expect(page.getByLabel("화면 모드")).toBeVisible()
    await expect(page.getByLabel("글자 크기")).toBeVisible()
    await page.screenshot({
      path: join(evidenceRoot, "settings-dark-100-920x640.png"),
      scale: "css",
    })
    await page.getByRole("button", { name: "200%", exact: true }).click()
    await expect(page.getByLabel("화면 모드")).toBeVisible()
    await expect(page.getByLabel("글자 크기")).toBeVisible()
    await expect(page.getByRole("button", { name: "설정 닫기", exact: true })).toBeVisible()
    await settings.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect.poll(() => settings.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({
      path: join(evidenceRoot, "settings-dark-200-920x640.png"),
      scale: "css",
    })
    await page.selectOption("#appearance-theme", "light")
    await page.getByRole("button", { name: "설정 닫기", exact: true }).click()
    await page.getByRole("button", { name: "설정", exact: true }).click()
    await page.getByRole("button", { name: "일반", exact: true }).click()
    await page.getByRole("button", { name: "200%", exact: true }).click()
    await settings.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect.poll(() => settings.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(page.getByRole("button", { name: "설정 닫기", exact: true })).toBeVisible()
    await page.screenshot({
      path: join(evidenceRoot, "settings-light-200-920x640.png"),
      scale: "css",
    })
    await page.getByRole("button", { name: "100%", exact: true }).click()
    await expect(page.getByLabel("화면 모드")).toBeVisible()
    await expect(page.getByLabel("글자 크기")).toBeVisible()
    await page.screenshot({
      path: join(evidenceRoot, "settings-light-100-920x640.png"),
      scale: "css",
    })
    await page.getByRole("button", { name: "50%", exact: true }).click()
    await expect(page.getByLabel("화면 모드")).toBeVisible()
    await expect(page.getByLabel("글자 크기")).toBeVisible()
    await page.screenshot({
      path: join(evidenceRoot, "settings-light-50-920x640.png"),
      scale: "css",
    })
    await page.selectOption("#appearance-theme", "dark")
    await expect(page.getByLabel("화면 모드")).toBeVisible()
    await expect(page.getByLabel("글자 크기")).toBeVisible()
    await page.screenshot({
      path: join(evidenceRoot, "settings-dark-50-920x640.png"),
      scale: "css",
    })
    await page.getByRole("button", { name: "설정 닫기", exact: true }).click()

    const beforeReopen = await page.evaluate(
      async ({ conceptId, noteId, boardId }) => ({
        concept: await window.ohmypaper.knowledge.getNode(conceptId),
        note: await window.ohmypaper.knowledge.getNode(noteId),
        placements: await window.ohmypaper.knowledge.findPlacementsForBoard(boardId),
      }),
      { conceptId: concept.id, noteId: note.id, boardId: board.id },
    )
    expect(beforeReopen.concept?.title).toBe(sixScreenConceptTitle)
    expect(beforeReopen.note?.body).toBe(noteBody)
    expect(beforeReopen.placements).toHaveLength(2)
    await qa.close()
    initialClosed = true

    reopened = await launchSimulatedAuthenticatedApplication({ userDataRoot })
    const reopenedPage = await reopened.application.firstWindow()
    reopenedPage.on("pageerror", (error) => reopenedPageErrors.push(error.message))
    await expect(reopenedPage.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await expect(reopenedPage.getByText("2개 문서", { exact: true })).toBeVisible()
    const afterReopen = await reopenedPage.evaluate(
      async ({ conceptId, noteId, boardId }) => ({
        concept: await window.ohmypaper.knowledge.getNode(conceptId),
        note: await window.ohmypaper.knowledge.getNode(noteId),
        placements: await window.ohmypaper.knowledge.findPlacementsForBoard(boardId),
      }),
      { conceptId: concept.id, noteId: note.id, boardId: board.id },
    )
    expect(afterReopen.concept?.title).toBe(sixScreenConceptTitle)
    expect(afterReopen.note?.body).toBe(noteBody)
    expect(afterReopen.placements).toHaveLength(2)
    await writeFile(
      join(evidenceRoot, "workflow-summary.json"),
      JSON.stringify(
        {
          authMode: qa.authMode,
          documents: [firstDocument, secondDocument].map(({ id, hash, title }) => ({
            id,
            hash,
            title,
          })),
          conceptId: concept.id,
          noteId: note.id,
          boardId: board.id,
          placementIds: placements.map(({ id }) => id),
          sourceReturn: {
            hash: firstDocument.hash,
            page: firstAnchor.page,
            quote: firstAnchor.quote,
          },
          pageErrors: [...pageErrors, ...reopenedPageErrors],
        },
        null,
        2,
      ),
    )
    expect([...pageErrors, ...reopenedPageErrors]).toEqual([])
  } finally {
    if (!initialClosed) await qa.close()
    if (reopened) await reopened.close()
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
