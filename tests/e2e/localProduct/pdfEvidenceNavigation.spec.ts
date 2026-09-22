import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { cardIdSchema } from "../../../src/shared/schemas"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

test("an imported PDF links to a concept and returns to its measured text region", async () => {
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    const importedDocument = await page.evaluate(
      async (path) => {
        const result = await window.ohmypaper.importDocumentPath(path)
        if (!result) throw new Error("Synthetic PDF import was cancelled")
        return result.document
      },
      join(process.cwd(), "tests/fixtures/sample-paper.pdf"),
    )
    await page.reload()
    await page.getByRole("button", { name: `${importedDocument.title} 열기`, exact: true }).click()
    const span = page
      .locator('.pdfViewer .page[data-page-number="1"] .textLayer span')
      .filter({ hasText: /oh-my-paper/ })
      .first()
    await expect(span).toBeVisible({ timeout: 30_000 })
    const measured = await span.evaluate((element) => {
      const board = document.querySelector(".board-viewport")
      const world = document.querySelector(".board-world")
      if (!board || !world) throw new Error("PDF board not ready")
      const rect = element.getBoundingClientRect()
      const origin = board.getBoundingClientRect()
      const transform = new DOMMatrix(getComputedStyle(world).transform)
      return {
        quote: element.textContent ?? "",
        x: (rect.x - origin.x - transform.e) / transform.a,
        y: (rect.y - origin.y - transform.f) / transform.d,
        width: rect.width / transform.a,
        height: rect.height / transform.d,
      }
    })
    expect(measured.width).toBeGreaterThan(0)
    await page.evaluate(
      async ({ source, measured }) => {
        const { quote, ...fragment } = measured
        await window.ohmypaper.knowledge.linkEvidence({
          documentId: source.id,
          hash: source.hash,
          anchor: { page: 1, quote, x: fragment.x, y: fragment.y, fragments: [fragment] },
          target: { type: "new", kind: "concept", title: "원문 위치 연결 QA" },
        })
      },
      { source: importedDocument, measured },
    )
    await page.getByRole("button", { name: "지식", exact: true }).click()
    await page.getByRole("button", { name: "개념 원문 위치 연결 QA", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: "원문 위치 연결 QA", exact: true }),
    ).toBeVisible()
    await page.getByRole("button", { name: `p.1 · ${measured.quote}`, exact: true }).click()
    await expect(page.locator(".board-viewport")).toHaveCount(1)
    await expect(page.locator(".board-viewport")).toHaveAttribute(
      "data-document-hash",
      importedDocument.hash,
    )
    await expect(page.getByText("1페이지 · 연결된 원문 구절", { exact: true })).toBeVisible()
    await expect(span).toBeInViewport()
    await expect(page.locator(".board-world .source-highlight")).toHaveCount(1)
    await page.screenshot({ path: test.info().outputPath("pdf-evidence-return.png") })
    await page.getByRole("button", { name: "표시 닫기", exact: true }).click()
    await expect(page.locator(".evidence-return")).toHaveCount(0)
  } finally {
    await qa.close()
  }
})

test("switching PDFs keeps page and card state scoped to the active document", async () => {
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const firstCardId = cardIdSchema.parse("11111111-1111-4111-8111-111111111111")
    const secondCardId = cardIdSchema.parse("22222222-2222-4222-8222-222222222222")
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    const documents = await page.evaluate(
      async (paths) => {
        const imported = []
        for (const path of paths) {
          const result = await window.ohmypaper.importDocumentPath(path)
          if (!result) throw new Error(`Synthetic PDF import was cancelled: ${path}`)
          imported.push(result.document)
        }
        return imported
      },
      [
        join(process.cwd(), "tests/fixtures/sample-paper.pdf"),
        join(process.cwd(), "tests/fixtures/document-ast/structured-document.pdf"),
      ],
    )
    const [firstDocument, secondDocument] = documents
    if (!firstDocument || !secondDocument) throw new Error("Two synthetic PDFs are required")
    await page.evaluate(
      async ({ firstId, secondId, firstCardId, secondCardId }) => {
        const workspace = await window.ohmypaper.readWorkspace()
        await window.ohmypaper.saveWorkspace({
          ...workspace,
          activeDocumentId: firstId,
          cards: [
            {
              id: firstCardId,
              documentId: firstId,
              kind: "explanation",
              title: "첫 문서 상태 카드",
              body: "첫 문서의 상태",
              x: 820,
              y: 420,
              minimized: false,
              width: 300,
              height: null,
              loading: false,
              chat: [],
              anchor: { page: 2, quote: "첫 문서 구절", x: 0, y: 0, fragments: [] },
            },
            {
              id: secondCardId,
              documentId: secondId,
              kind: "explanation",
              title: "둘째 문서 상태 카드",
              body: "둘째 문서의 상태",
              x: 820,
              y: 420,
              minimized: false,
              width: 300,
              height: null,
              loading: false,
              chat: [],
              anchor: { page: 1, quote: "둘째 문서 구절", x: 0, y: 0, fragments: [] },
            },
          ],
        })
      },
      {
        firstId: firstDocument.id,
        secondId: secondDocument.id,
        firstCardId,
        secondCardId,
      },
    )
    await page.reload()
    await page.getByRole("button", { name: `${firstDocument.title} 열기`, exact: true }).click()
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator(".board-viewport")).toHaveCount(1)
    await expect(page.locator(".board-viewport")).toHaveAttribute(
      "data-document-hash",
      firstDocument.hash,
    )
    await page.getByRole("button", { name: "AI 설명 모드", exact: true }).click()
    await expect(page.getByRole("button", { name: /첫 문서 상태 카드, p\.2/u })).toBeVisible()
    await expect(page.getByRole("button", { name: /둘째 문서 상태 카드/u })).toHaveCount(0)
    await page.getByRole("button", { name: /첫 문서 상태 카드, p\.2/u }).click()
    await page.getByRole("button", { name: "번역 모드", exact: true }).click()
    await expect(page.getByRole("region", { name: "페이지 번역" })).toBeVisible()
    await expect(page.getByText(`p. 2 / ${firstDocument.pageCount}`, { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await page.getByRole("button", { name: `${secondDocument.title} 열기`, exact: true }).click()
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator(".board-viewport")).toHaveCount(1)
    await expect(page.locator(".board-viewport")).toHaveAttribute(
      "data-document-hash",
      secondDocument.hash,
    )
    await page.getByRole("button", { name: "AI 설명 모드", exact: true }).click()
    await expect(page.getByRole("button", { name: /둘째 문서 상태 카드, p\.1/u })).toBeVisible()
    await expect(page.getByRole("button", { name: /첫 문서 상태 카드/u })).toHaveCount(0)
    await page.getByRole("button", { name: "번역 모드", exact: true }).click()
    await expect(page.getByRole("region", { name: "페이지 번역" })).toBeVisible()
    await expect(
      page.getByText(`p. 1 / ${secondDocument.pageCount}`, { exact: true }),
    ).toBeVisible()
  } finally {
    await qa.close()
  }
})
