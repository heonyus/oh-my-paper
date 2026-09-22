import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { ipcChannels } from "../../src/shared/ipc"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("library is a responsive home that opens existing PDFs", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-library-e2e-"))
  const userData = join(temporaryRoot, "user-data")
  const storeRoot = join(userData, "ohmypaper")
  const documentsRoot = join(storeRoot, "documents")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const documents = [
    ["1111111111111111", "1".repeat(64), "MedAgentGym", "research_paper"],
    ["2222222222222222", "2".repeat(64), "Clinical Data Quality Report", "report"],
    ["3333333333333333", "3".repeat(64), "Device Setup Guide", "manual"],
  ] as const
  await mkdir(documentsRoot, { recursive: true })
  for (const document of documents)
    await copyFile(fixture, join(documentsRoot, `${document[1]}.pdf`))
  await writeFile(
    join(storeRoot, "workspace.json"),
    JSON.stringify({
      documents: documents.map(([id, hash, title, kind], index) => ({
        id,
        hash,
        title,
        kind,
        name: `${title}.pdf`,
        bytes: bytes.length,
        importedAt: `2026-08-${30 - index}T00:00:00.000Z`,
        pageCount: 3,
        authors: index === 0 ? ["Research Team"] : [],
        year: 2026,
        doi: null,
        overview: `Page 1: ${title} prepared overview`,
        quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
      })),
      cards: [],
      insights: [
        {
          documentId: documents[1][0],
          kind: "keywords",
          value: "- **Data quality**: 임상 데이터의 신뢰성",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
        {
          documentId: documents[1][0],
          kind: "threeLines",
          value: "1. 문제: 데이터 품질\n2. 방법: 검증\n3. 결과: 신뢰성 향상",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
        {
          documentId: documents[1][0],
          kind: "summary",
          value: "- 검증 가능한 에이전트 벤치마크",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
      sidebarOpen: true,
      viewport: { x: 88, y: 36, zoom: 0.51 },
      activeDocumentId: documents[0][0],
    }),
  )
  const qa = await launchSimulatedAuthenticatedApplication({
    userDataRoot: userData,
    environment: {
      OH_MY_PAPER_PADDLE_VL_READY: join(temporaryRoot, "missing-paddle-runtime"),
    },
  })
  try {
    const page = await qa.application.firstWindow()
    const library = page.getByRole("region", { name: "PDF 라이브러리" })
    await expect(library).toBeVisible()
    await expect(page.locator('.document-thumbnail[data-rendered="true"]')).toHaveCount(3)
    const electronWindow = await qa.application.browserWindow(page)
    const evidence = join(process.cwd(), ".omo", "evidence", "library-home")
    await mkdir(evidence, { recursive: true })
    await electronWindow.evaluate((browserWindow) => browserWindow.setSize(920, 640))
    await page.waitForTimeout(150)
    expect(
      await page
        .locator(".library-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    ).toBe(2)
    await page.screenshot({ path: join(evidence, "library-920.png") })
    await electronWindow.evaluate((browserWindow) => browserWindow.setSize(1280, 800))
    await page.waitForTimeout(150)
    expect(
      await page
        .locator(".library-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    ).toBe(3)
    await page.screenshot({ path: join(evidence, "library-1280.png") })
    await electronWindow.evaluate((browserWindow) => browserWindow.setSize(1536, 1024))
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(evidence, "library-1536.png") })
    await page.evaluate(async (path) => {
      await window.ohmypaper.importDocumentPath(path)
    }, fixture)
    const importedId = await page.evaluate(async () => {
      const workspace = await window.ohmypaper.readWorkspace()
      return workspace.activeDocumentId
    })
    if (!importedId) throw new Error("imported document id is missing")
    await page.evaluate(async (id) => {
      await window.ohmypaper.writePageTranslationCache({
        id,
        pageNumber: 1,
        targetLanguage: "ko",
        provider: "openrouter",
        model: "cache-qa-model",
        blocks: [
          {
            id: "page:1:block:0:sentence:1",
            kind: "body",
            source: "Persistent source sentence.",
            translation: "영구 캐시 번역 문장.",
          },
        ],
      })
    }, importedId)
    await page.reload()
    await expect(library).toBeVisible()
    await expect(page.getByText("4개 문서")).toBeVisible()
    expect(
      await page.evaluate(
        async (id) =>
          window.ohmypaper.readPageTranslationCache({
            id,
            pageNumber: 1,
            targetLanguage: "ko",
            provider: "openrouter",
            model: "cache-qa-model",
          }),
        importedId,
      ),
    ).toMatchObject({ status: "ready", blocks: [{ translation: "영구 캐시 번역 문장." }] })
    await qa.application.evaluate(
      ({ BrowserWindow }, payload) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send(payload.channel, payload.update),
      {
        channel: ipcChannels.documentAnalysisUpdated,
        update: [
          {
            id: documents[0][0],
            title: "MedAgentGym",
            pageCount: 18,
            completedPages: 4,
            currentPage: 5,
            stage: "document-analyzing",
            engine: "local",
            attempt: 1,
            maxAttempts: 2,
            state: "running",
          },
        ],
      },
    )
    await expect(page.getByText("5 / 18페이지 · 구조 분석 중")).toBeVisible()
    await qa.application.evaluate(
      ({ BrowserWindow }, payload) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send(payload.channel, payload.update),
      {
        channel: ipcChannels.importProgress,
        update: {
          id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
          fileName: "new-paper.pdf",
          stage: "layout",
          state: "active",
          progress: 0.6,
          message: "페이지 구성 분석 중",
        },
      },
    )
    await expect(page.getByRole("region", { name: "PDF 준비 진행" })).toBeVisible()
    await expect(page.getByRole("button", { name: "MedAgentGym 열기" })).toBeVisible()
    expect(
      await page
        .locator(".library-task-flow")
        .first()
        .evaluate((element) =>
          element.getAnimations().some((animation) => animation.playState === "running"),
        ),
    ).toBe(true)
    await page.screenshot({ path: join(evidence, "library-import-existing-1536.png") })
    await electronWindow.evaluate((browserWindow) => browserWindow.setSize(920, 640))
    await page.waitForTimeout(150)
    const taskQueueBox = await page.getByRole("region", { name: "PDF 준비 진행" }).boundingBox()
    if (!taskQueueBox) throw new Error("library task queue must be measurable")
    expect(taskQueueBox.x).toBeGreaterThanOrEqual(0)
    expect(taskQueueBox.x + taskQueueBox.width).toBeLessThanOrEqual(920)
    await page.screenshot({ path: join(evidence, "library-task-queue-920.png") })
    await electronWindow.evaluate((browserWindow) => browserWindow.setSize(1536, 1024))
    await page.waitForTimeout(150)
    await page
      .locator(".app-shell")
      .evaluate((element) => element.setAttribute("data-theme", "dark"))
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(evidence, "library-1536-dark.png") })
    await page
      .locator(".app-shell")
      .evaluate((element) => element.setAttribute("data-theme", "light"))
    await page.waitForTimeout(150)
    await page.getByRole("button", { name: "Clinical Data Quality Report 열기" }).click()
    await expect(page.locator(".board-viewport")).toBeVisible()
    await expect(page.getByRole("region", { name: "PDF 준비 진행" })).not.toBeVisible()
    const automaticTranslation = page.getByRole("button", { name: "자동 번역 켜기" })
    const translationChildCenters = await automaticTranslation
      .locator("svg, span, small")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect()
          return bounds.top + bounds.height / 2
        }),
      )
    expect(
      Math.max(...translationChildCenters) - Math.min(...translationChildCenters),
    ).toBeLessThan(3)
    await page
      .locator(".topbar")
      .screenshot({ path: join(evidence, "topbar-translation-fixed.png") })
    await expect(page.getByRole("button", { name: "포스트잇 도구" })).toHaveCount(0)
    await expect(page.locator(".pdfViewer .page .textLayer span").first()).toBeVisible()
    await page.getByRole("button", { name: "AI 개요 열기" }).hover()
    await expect(page.getByText("검증 가능한 에이전트 벤치마크")).toBeVisible()
    await expect(page.locator(".preparation-progress")).not.toBeVisible()
    const boardBox = await page.locator(".board-viewport").boundingBox()
    const paperBox = await page.locator(".pdfViewer .page").first().boundingBox()
    if (!boardBox || !paperBox) throw new Error("board and paper bounds must be measurable")
    expect(paperBox.x).toBeLessThan(boardBox.x + boardBox.width)
    expect(paperBox.x + paperBox.width).toBeGreaterThan(boardBox.x)
    expect(paperBox.y).toBeLessThan(boardBox.y + boardBox.height)
    expect(paperBox.y + paperBox.height).toBeGreaterThan(boardBox.y)
    await page
      .locator(".pdfViewer .page")
      .first()
      .screenshot({ path: join(evidence, "board-paper-element.png") })
    const boardCapture = await electronWindow.evaluate(async (browserWindow) =>
      (await browserWindow.capturePage()).toDataURL(),
    )
    await writeFile(
      join(evidence, "board-summary-discussion-1536.png"),
      boardCapture.replace(/^data:image\/png;base64,/u, ""),
      "base64",
    )
    await page.getByRole("button", { name: "포스트잇 모드" }).click()
    await expect(page.locator(".board-viewport")).toHaveAttribute("data-tool", "sticky")
    await page.getByRole("button", { name: "라이브러리" }).click()
    await expect(library).toBeVisible()
    await page.getByRole("button", { name: "문서" }).click()
    await expect(page.locator(".pdfViewer .page .textLayer span").first()).toBeVisible()
    await page.getByRole("button", { name: "AI 개요 열기" }).hover()
    await expect(page.getByText("검증 가능한 에이전트 벤치마크")).toBeVisible()
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
