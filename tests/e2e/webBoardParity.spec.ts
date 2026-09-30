import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"

const webDocumentId = "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82"
const sourceHash = "a".repeat(64)
test.use({ viewport: { width: 1536, height: 1024 } })

test("web reader keeps the full research board and page-adjacent translation", async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "session-1",
          token: "test-token",
          userId: "user-1",
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdAt: "2026-09-04T00:00:00.000Z",
          updatedAt: "2026-09-04T00:00:00.000Z",
        },
        user: {
          id: "user-1",
          name: "Researcher",
          email: "researcher@example.test",
          emailVerified: true,
          createdAt: "2026-09-04T00:00:00.000Z",
          updatedAt: "2026-09-04T00:00:00.000Z",
        },
      },
    }),
  )
  await page.route("**/api/documents", (route) =>
    route.fulfill({
      json: {
        documents: [
          {
            id: webDocumentId,
            name: "sample-paper.pdf",
            sourceHash,
            status: "ready",
            pageCount: 3,
            errorCode: null,
            createdAt: "2026-09-04T00:00:00.000Z",
          },
        ],
      },
    }),
  )
  await page.route("**/api/credentials", (route) =>
    route.fulfill({
      json: {
        providers: {
          gemini: { source: "shared", model: "gemini-3.5-flash-lite" },
          groq: { source: "missing", model: "openai/gpt-oss-20b" },
        },
        preferredTextProvider: "gemini",
      },
    }),
  )
  await page.route("**/api/documents/*/file", async (route) =>
    route.fulfill({
      contentType: "application/pdf",
      body: await readFile(join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")),
    }),
  )
  await page.route("**/api/documents/*/pages/*/translate*", (route) =>
    route.fulfill({
      json: {
        documentId: webDocumentId,
        pageNumber: 1,
        pageWidth: 612,
        pageHeight: 792,
        cached: true,
        items: [
          {
            id: "page:1:block:0",
            source: "This fixture verifies page-adjacent translation.",
            translation: "이 픽스처는 페이지 옆 번역을 검증합니다.",
            kind: "body",
            bounds: { x: 72, y: 120, width: 320, height: 48 },
          },
        ],
      },
    }),
  )
  await page.route("**/api/documents/*/pages/*", (route) =>
    route.fulfill({
      json: {
        schemaVersion: "1.0.0",
        sourceHash,
        parser: "PDF.js+PaddleOCR-VL-1.6",
        configVersion: "web-e2e-v1",
        pageNumber: 1,
        width: 612,
        height: 792,
        blocks: [
          {
            id: "page:1:block:0",
            label: "text",
            order: 0,
            bounds: { x: 72, y: 120, width: 320, height: 48 },
            content: "This fixture verifies page-adjacent translation.",
            contentFormat: "text",
            translationPolicy: "include",
          },
        ],
      },
    }),
  )

  await page.goto("http://127.0.0.1:4174/")
  const evidence = join(process.cwd(), "test-results", "evidence", "web-board-parity")
  await mkdir(evidence, { recursive: true })
  await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
  await expect(page.getByRole("region", { name: "PDF 준비 진행" })).toHaveCount(0)
  await page.screenshot({
    path: join(evidence, "library-ready-no-completed-task.png"),
    scale: "css",
  })
  await page.getByRole("button", { name: "설정" }).click()
  await page.getByRole("button", { name: "AI 모델" }).click()
  await expect(page.getByLabel("Gemini API 키")).toBeVisible()
  await expect(page.getByLabel("Groq API 키")).toBeVisible()
  await expect(page.getByLabel(/OCR API 키/)).toHaveCount(0)
  await expect(page.getByLabel("Provider")).toHaveCount(0)
  const settingsPage = page.locator(".settings-page")
  const initialScroll = await settingsPage.evaluate((element) => ({
    top: element.scrollTop,
    height: element.clientHeight,
    contentHeight: element.scrollHeight,
  }))
  expect(initialScroll.contentHeight).toBeGreaterThan(initialScroll.height)
  await settingsPage.hover()
  await page.mouse.wheel(0, 600)
  await expect
    .poll(() => settingsPage.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScroll.top)
  await page.screenshot({ path: join(evidence, "credential-settings.png"), scale: "css" })
  await page.getByRole("button", { name: "설정 닫기" }).click()
  await page.getByRole("button", { name: "sample-paper 열기" }).click()
  await page.waitForSelector('.pdfViewer .page[data-page-number="1"] canvas')

  await expect(page.getByRole("combobox", { name: "읽는 논문" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "연구 사이드바 모드" })).toBeVisible()
  await expect(page.getByLabel("보드 미니맵")).toBeVisible()
  await expect(page.locator(".translation-pane")).toHaveCount(0)

  await page.getByRole("button", { name: "번역 모드" }).click()
  await expect(page.locator(".research-sidebar-flyout")).toHaveCSS("visibility", "hidden")
  const pdf = page.locator('.pdfViewer .page[data-page-number="1"]')
  const translation = page.locator(".page-translation-pane")
  await expect(translation).toHaveCount(1)
  await expect(translation).toHaveAttribute("data-positioned", "true")
  await expect(translation).toContainText("이 픽스처는 페이지 옆 번역을 검증합니다.")
  const pdfBox = await pdf.boundingBox()
  const translationBox = await translation.boundingBox()
  expect(pdfBox).not.toBeNull()
  expect(translationBox).not.toBeNull()
  if (!pdfBox || !translationBox) return
  expect(translationBox.x).toBeGreaterThan(pdfBox.x + pdfBox.width)
  expect(Math.abs(translationBox.y - pdfBox.y)).toBeLessThan(4)

  await page.screenshot({ path: join(evidence, "actual-1536x1024.png"), scale: "css" })
})
