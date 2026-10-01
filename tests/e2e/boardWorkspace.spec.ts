import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("post-it, resizable sidebar, cached Markdown, and Retina PDF stay usable", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-board-e2e-"))
  const userData = join(temporaryRoot, "user-data")
  const storeRoot = join(userData, "ohmypaper")
  const documents = join(storeRoot, "documents")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const hash = createHash("sha256").update(bytes).digest("hex")
  const id = hash.slice(0, 16)
  await mkdir(join(storeRoot, "layout"), { recursive: true })
  await mkdir(documents, { recursive: true })
  await copyFile(fixture, join(documents, `${hash}.pdf`))
  await writeFile(
    join(storeRoot, "layout", `${id}.json`),
    JSON.stringify({ version: 2, model: "PP-DocLayout_plus-L", sourceHash: hash, pages: [] }),
  )
  await writeFile(
    join(storeRoot, "workspace.json"),
    JSON.stringify({
      layoutVersion: 2,
      documents: [
        {
          id,
          name: basename(fixture),
          hash,
          bytes: bytes.length,
          importedAt: "2026-08-28T00:00:00.000Z",
          pageCount: 3,
          title: "oh-my-paper deterministic fixture",
          authors: [],
          year: null,
          doi: null,
          quality: { textCharacters: 0, needsOcr: false, warnings: [] },
        },
      ],
      cards: [
        {
          id: "42ad8d84-c1ee-45b4-a022-6cf0d4c14278",
          documentId: id,
          kind: "explanation",
          title: "Abstract 해설",
          body: "cached explanation",
          x: 820,
          y: 420,
          minimized: false,
          width: 300,
          height: null,
          loading: false,
          chat: [],
          sourceKey: "1:section:Abstract",
          anchor: {
            page: 1,
            quote: "Abstract",
            x: 760,
            y: 350,
            fragments: [{ x: 620, y: 340, width: 140, height: 20 }],
          },
        },
      ],
      insights: [
        {
          documentId: id,
          kind: "summary",
          value: "## 캐시된 논문 요약\n\n- 핵심 방법\n- 검증 결과\n\n$$S = f(x)$$",
          updatedAt: "2026-08-28T00:00:00.000Z",
        },
      ],
      sidebarOpen: true,
      outlineWidth: 240,
      researchSidebarWidth: 340,
      viewport: { x: 88, y: 36, zoom: 0.9 },
      activeDocumentId: id,
    }),
  )
  const qa = await launchSimulatedAuthenticatedApplication({ userDataRoot: userData })
  const application = qa.application
  try {
    const page = await application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await page.getByRole("button", { name: "oh-my-paper deterministic fixture 열기" }).click()
    await page.waitForSelector(".pdfViewer .page canvas", { timeout: 30_000 })
    const board = page.locator(".board-viewport")
    const researchRail = page.getByRole("navigation", { name: "연구 사이드바 모드" })
    const researchFlyout = page.locator(".research-sidebar-flyout")
    await expect(researchFlyout).toHaveCSS("visibility", "hidden")
    await researchRail.hover()
    await expect(researchFlyout).toHaveCSS("visibility", "visible")
    await expect(page.getByText("캐시된 논문 요약")).toBeVisible()
    await board.hover({ position: { x: 24, y: 24 } })
    await expect(researchFlyout).toHaveCSS("visibility", "hidden")
    const minimap = page.getByLabel("보드 미니맵")
    const minimapMap = page.getByLabel("미니맵 탐색")
    await expect(minimap).toBeVisible()
    await expect(minimapMap).toHaveAttribute("viewBox", "0 0 100 100")
    const homeIcon = page.getByRole("button", { name: "첫 페이지로" }).locator("svg")
    await expect(homeIcon).toBeVisible()
    expect((await homeIcon.boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      16,
    )
    const citationActionWinsPointerHit = await page.evaluate(() => {
      const root = document.createElement("div")
      root.style.cssText =
        "position:fixed;left:10px;top:10px;width:180px;height:60px;z-index:999999"
      const annotationLayer = document.createElement("div")
      annotationLayer.className = "annotationLayer"
      const annotation = document.createElement("section")
      annotation.className = "linkAnnotation"
      annotation.style.cssText = "left:0;top:0;width:140px;height:32px;z-index:82"
      const anchor = document.createElement("a")
      anchor.href = "#cite.synthetic"
      annotation.append(anchor)
      annotationLayer.append(annotation)
      const structureHost = document.createElement("div")
      structureHost.className = "paper-structure-host"
      const action = document.createElement("button")
      action.className = "structure-ai-badge"
      action.style.cssText = "left:0;top:0;width:140px;height:32px;opacity:1;transform:none"
      structureHost.append(action)
      root.append(annotationLayer, structureHost)
      document.body.append(root)
      const hit = document.elementFromPoint(40, 26)
      root.remove()
      return hit === action
    })
    expect(citationActionWinsPointerHit).toBe(true)
    const firstPage = page.locator('.pdfViewer .page[data-page-number="1"]')
    const initialPageRect = await firstPage.boundingBox()
    await board.dispatchEvent("wheel", { deltaX: 0, deltaY: 120 })
    await expect
      .poll(async () => (await firstPage.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(initialPageRect?.y ?? Number.POSITIVE_INFINITY)
    await board.dispatchEvent("wheel", { deltaX: 0, deltaY: -5_000 })
    const boundedBoardRect = await board.boundingBox()
    await expect
      .poll(async () => (await firstPage.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
      .toBeCloseTo((boundedBoardRect?.y ?? 0) + 40, 0)
    await minimapMap.click({ position: { x: 70, y: 150 } })
    await expect
      .poll(async () => (await firstPage.boundingBox())?.y ?? Number.NEGATIVE_INFINITY)
      .toBeLessThan(boundedBoardRect?.y ?? 0)
    await page.getByRole("button", { name: "첫 페이지로" }).click()
    await expect
      .poll(async () => (await firstPage.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
      .toBeCloseTo((boundedBoardRect?.y ?? 0) + 40, 0)
    const topEdgeFrames = await board.evaluate(async (element) => {
      const world = element.querySelector<HTMLElement>(".board-world")
      if (!world) return []
      const samples: number[] = []
      const capture = (): void => {
        samples.push(new DOMMatrix(world.style.transform).f)
      }
      capture()
      element.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -900, bubbles: true, cancelable: true }),
      )
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          capture()
          requestAnimationFrame(() => {
            capture()
            resolve()
          })
        })
      })
      return samples
    })
    expect(Math.max(...topEdgeFrames) - Math.min(...topEdgeFrames)).toBeLessThan(1)
    const surfaceTranslation = async (): Promise<{ readonly x: number; readonly y: number }> =>
      await page.locator(".pdf-surface").evaluate((element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform)
        return { x: matrix.e, y: matrix.f }
      })
    const beforeAxisLock = await surfaceTranslation()
    await board.dispatchEvent("wheel", { deltaX: 7, deltaY: 100 })
    await expect.poll(async () => (await surfaceTranslation()).y).toBeLessThan(beforeAxisLock.y)
    const afterAxisLock = await surfaceTranslation()
    expect(afterAxisLock.x).toBeCloseTo(beforeAxisLock.x)
    await page.getByRole("button", { name: "첫 페이지로" }).click()
    await page.keyboard.press("Meta+f")
    const retrieval = page.getByRole("dialog", { name: "문서 연관 검색" })
    await expect(retrieval).toBeVisible()
    const retrievalInput = retrieval.getByRole("searchbox", { name: "현재 문서 검색" })
    await expect(retrievalInput).toBeFocused()
    await retrievalInput.fill("document")
    await expect.poll(async () => retrieval.getByRole("option").count()).toBeGreaterThanOrEqual(3)
    await page.locator(".document-retrieval-layer").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      )
    })
    await mkdir(join(process.cwd(), "test-results", "evidence", "document-retrieval"), {
      recursive: true,
    })
    await page.screenshot({
      path: join(
        process.cwd(),
        "test-results",
        "evidence",
        "document-retrieval",
        "actual-1536x1024.png",
      ),
    })
    const browserWindow = await application.browserWindow(page)
    const originalViewport = await browserWindow.evaluate((window) => {
      const [width, height] = window.getContentSize()
      return { width, height }
    })
    await browserWindow.evaluate((window) => window.setContentSize(1280, 800))
    await expect.poll(async () => page.evaluate(() => window.innerWidth)).toBe(1280)
    await expect(retrieval).toBeVisible()
    expect((await retrieval.boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      1240,
    )
    await page.screenshot({
      path: join(
        process.cwd(),
        "test-results",
        "evidence",
        "document-retrieval",
        "actual-1280x800.png",
      ),
    })
    await browserWindow.evaluate((window) => window.setContentSize(920, 640))
    await expect.poll(async () => page.evaluate(() => window.innerWidth)).toBe(920)
    await expect(retrieval.getByRole("option").first()).toBeVisible()
    expect((await retrieval.boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      880,
    )
    await page.screenshot({
      path: join(
        process.cwd(),
        "test-results",
        "evidence",
        "document-retrieval",
        "actual-920x640.png",
      ),
    })
    await browserWindow.evaluate(
      (window, size) => window.setContentSize(size.width, size.height),
      originalViewport,
    )
    await browserWindow.dispose()
    await retrievalInput.fill("retrieval likelihood")
    await expect(retrieval.getByRole("option")).toHaveCount(1)
    await expect(retrieval.getByRole("option").first()).toContainText("p. 2")
    await retrievalInput.press("Enter")
    await expect(retrieval).toBeHidden()
    await expect
      .poll(
        async () => (await page.locator('.pdfViewer .page[data-page-number="2"]').boundingBox())?.y,
      )
      .toBeGreaterThan(60)
    await expect
      .poll(async () => page.locator(".document-retrieval-hit").count())
      .toBeGreaterThan(0)
    await page.keyboard.press("Meta+f")
    await expect(retrieval).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(retrieval).toBeHidden()
    await page.getByRole("button", { name: "첫 페이지로" }).click()
    await researchRail.hover()
    const discussionInput = page.getByRole("textbox", { name: "논문 토론 질문" })
    await expect(discussionInput).toBeVisible()
    await expect(discussionInput).not.toHaveAttribute("placeholder")
    expect(
      await discussionInput
        .locator("..")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgb(244, 246, 248)")
    expect(
      (await page.getByRole("button", { name: "토론 질문 보내기" }).boundingBox())?.width ??
        Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(28)
    expect(
      await page.locator(":root").evaluate((element) => getComputedStyle(element).colorScheme),
    ).toBe("light")
    const explanationCard = page.locator('.board-card[data-kind="explanation"]')
    await expect(explanationCard).toBeVisible()
    await page.getByRole("button", { name: "번역 모드" }).click()
    const pageTranslation = page.getByRole("region", { name: "페이지 번역" })
    await expect(pageTranslation).toBeVisible()
    expect(
      await pageTranslation.evaluate((element) => element.parentElement?.className ?? ""),
    ).toContain("board-world")
    const translationLayer = await pageTranslation.evaluate((element) =>
      Number.parseInt(getComputedStyle(element).zIndex, 10),
    )
    const cardLayer = await explanationCard.evaluate((element) =>
      Number.parseInt(getComputedStyle(element).zIndex, 10),
    )
    expect(cardLayer).toBeGreaterThan(translationLayer)
    const cardWinsOverlap = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.board-card[data-kind="explanation"]')
      const translation = document.querySelector<HTMLElement>(".page-translation-pane")
      if (!card || !translation) return false
      const originalLeft = translation.style.left
      const originalTop = translation.style.top
      translation.style.left = card.style.left
      translation.style.top = card.style.top
      const cardRect = card.getBoundingClientRect()
      const translationRect = translation.getBoundingClientRect()
      const left = Math.max(cardRect.left, translationRect.left)
      const top = Math.max(cardRect.top, translationRect.top)
      const right = Math.min(cardRect.right, translationRect.right)
      const bottom = Math.min(cardRect.bottom, translationRect.bottom)
      const cardWins =
        right > left &&
        bottom > top &&
        Boolean(
          document.elementFromPoint((left + right) / 2, (top + bottom) / 2)?.closest(".board-card"),
        )
      translation.style.left = originalLeft
      translation.style.top = originalTop
      return cardWins
    })
    expect(cardWinsOverlap).toBe(true)
    const firstPageBeforeTranslationZoom = await firstPage.boundingBox()
    const translationBeforeZoom = await pageTranslation.boundingBox()
    await page.getByRole("button", { name: "확대" }).click()
    await expect
      .poll(async () => (await pageTranslation.boundingBox())?.width ?? 0)
      .toBeGreaterThan(translationBeforeZoom?.width ?? 0)
    const firstPageAfterTranslationZoom = await firstPage.boundingBox()
    const translationAfterZoom = await pageTranslation.boundingBox()
    const translationZoom = Number(await page.locator(".pdf-surface").getAttribute("data-zoom"))
    const translatedGap =
      (translationAfterZoom?.x ?? 0) -
      (firstPageAfterTranslationZoom?.x ?? 0) -
      (firstPageAfterTranslationZoom?.width ?? 0)
    expect(translatedGap).toBeCloseTo(16 * translationZoom, 0)
    await page.getByRole("button", { name: "축소" }).click()
    await expect
      .poll(async () => (await firstPage.boundingBox())?.width ?? 0)
      .toBeCloseTo(firstPageBeforeTranslationZoom?.width ?? 0, 0)
    await page.getByRole("button", { name: "AI 설명 모드" }).click()
    const beforeCardWheel = await surfaceTranslation()
    await explanationCard.locator(".card-body").dispatchEvent("wheel", { deltaY: 120 })
    expect(await surfaceTranslation()).toEqual(beforeCardWheel)
    const beforeZoomRoundTrip = await firstPage.boundingBox()
    await page.getByRole("button", { name: "확대" }).click()
    await expect
      .poll(async () => (await firstPage.boundingBox())?.width ?? 0)
      .toBeGreaterThan(beforeZoomRoundTrip?.width ?? 0)
    await page.getByRole("button", { name: "축소" }).click()
    await expect
      .poll(async () => (await firstPage.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
      .toBeCloseTo(beforeZoomRoundTrip?.x ?? 0, 0)
    await expect(page.locator(".connector-layer path")).toHaveCount(0)
    await explanationCard.locator(".card-head").click()
    await expect(page.locator(".connector-layer path")).toHaveCount(1)
    await board.click({ position: { x: 24, y: 24 } })
    await expect(page.locator(".connector-layer path")).toHaveCount(0)
    await page.getByRole("button", { name: "AI 설명 모드" }).click()
    await expect(
      page.getByRole("button", { name: "AI 설명 모드" }).locator(".mode-count"),
    ).toHaveCount(0)
    await page.getByRole("button", { name: /Abstract 해설/u }).click()
    const focusedCard = await explanationCard.boundingBox()
    const boardBounds = await page.locator(".board-viewport").boundingBox()
    if (!focusedCard || !boardBounds) throw new Error("focused board card must be rendered")
    expect(focusedCard.x).toBeGreaterThanOrEqual(boardBounds.x)
    expect(focusedCard.x + focusedCard.width).toBeLessThanOrEqual(boardBounds.x + boardBounds.width)
    await explanationCard.getByRole("button", { name: "카드 최소화" }).click()
    await expect(explanationCard).toHaveAttribute("data-minimized", "true")
    expect(
      (await explanationCard.boundingBox())?.height ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(34)
    await explanationCard.getByRole("button", { name: "카드 펼치기" }).click()
    const beforeResize = await explanationCard.boundingBox()
    const resizeHandle = explanationCard.getByRole("button", { name: "카드 크기 조절" })
    const handleBox = await resizeHandle.boundingBox()
    if (beforeResize && handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(handleBox.x + 64, handleBox.y + 54, { steps: 6 })
      await page.mouse.up()
      await expect
        .poll(async () => (await explanationCard.boundingBox())?.width ?? 0)
        .toBeGreaterThan(beforeResize.width)
    }
    await expect(explanationCard.getByLabel("카드에 후속 질문")).toBeVisible()
    // A note card opens with N over the paper and goes into this page's note.
    await expect(page.getByRole("button", { name: "포스트잇 모드" })).toHaveCount(0)
    await page.locator(".board-viewport").click({ position: { x: 620, y: 720 } })
    await page.keyboard.press("n")
    const noteCard = page.getByRole("region", { name: "노트 카드" })
    await noteCard.getByRole("textbox", { name: "노트 카드 내용" }).fill("검토 메모")
    await page.keyboard.press("Meta+Enter")
    await expect(noteCard).toHaveCount(0)
    await page.getByRole("button", { name: "열기", exact: true }).click()
    const readerNote = page.getByRole("region", { name: "내 노트" })
    await expect(readerNote.getByText("검토 메모")).toBeVisible()
    await readerNote.getByRole("button", { name: "노트 닫기" }).click()

    await researchRail.hover()
    const resize = page.getByRole("separator", { name: "연구 사이드바 너비 조절" })
    await resize.focus()
    await resize.press("ArrowRight")
    await expect(resize).toHaveAttribute("aria-valuenow", "356")

    const density = await page
      .locator(".pdfViewer .page canvas")
      .first()
      .evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) return 0
        const bounds = element.getBoundingClientRect()
        return element.width / bounds.width
      })
    expect(density).toBeGreaterThanOrEqual(0.95)
    await expect(page.getByText("논문을 보드에 준비하는 중")).toBeHidden({ timeout: 5_000 })
    await mkdir(join(process.cwd(), "test-results", "evidence", "ohmypaper-board-polish"), {
      recursive: true,
    })
    await page.screenshot({
      path: join(
        process.cwd(),
        "test-results",
        "evidence",
        "ohmypaper-board-polish",
        "actual-1536x1024.png",
      ),
    })
    await minimap.screenshot({
      path: join(
        process.cwd(),
        "test-results",
        "evidence",
        "ohmypaper-board-polish",
        "minimap-actual.png",
      ),
    })
    await page.getByRole("button", { name: "미니맵 숨기기" }).click()
    await expect(minimap).toBeHidden()
    await page.getByRole("button", { name: "미니맵" }).click()
    await expect(minimap).toBeVisible()
    await page.getByRole("button", { name: "설정" }).click()
    await page.getByRole("button", { name: "일반" }).click()
    await page.getByLabel("화면 모드").selectOption("dark")
    await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark")
    expect(
      await page.locator(".app-shell").evaluate((element) => getComputedStyle(element).color),
    ).toBe("rgb(242, 242, 244)")
    await page.screenshot({
      path: join(
        process.cwd(),
        "test-results",
        "evidence",
        "ohmypaper-board-polish",
        "actual-dark-1536x1024.png",
      ),
    })
    const rapidZoom = await board.evaluate(async (element) => {
      for (let index = 0; index < 12; index += 1) {
        element.dispatchEvent(
          new WheelEvent("wheel", { ctrlKey: true, deltaY: -12, bubbles: true, cancelable: true }),
        )
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      const surface = element.querySelector<HTMLElement>(".pdf-surface")
      return {
        requested: Number(surface?.getAttribute("data-zoom")),
        rendered: Number(surface?.getAttribute("data-rendered-zoom")),
      }
    })
    expect(rapidZoom.requested).toBeGreaterThan(1.5)
    expect(rapidZoom.rendered).toBeLessThan(rapidZoom.requested)
    await expect
      .poll(async () =>
        Number(await page.locator(".pdf-surface").getAttribute("data-rendered-zoom")),
      )
      .toBeCloseTo(rapidZoom.requested, 2)
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
