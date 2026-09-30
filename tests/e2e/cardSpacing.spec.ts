import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("research cards keep prose and chat clear of every card edge", async () => {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-card-spacing-"))
  const userData = join(root, "user-data")
  const store = join(userData, "ohmypaper")
  const documents = join(store, "documents")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const hash = createHash("sha256").update(bytes).digest("hex")
  const id = hash.slice(0, 16)
  const evidence = join(process.cwd(), "test-results", "evidence", "card-spacing")
  const cardBody =
    "# 한눈에\n\n이 문단은 논문의 핵심 주장을 요약합니다. 과거 분석 경험을 **데이터셋·방법론 제약 조건에 묶어 재사용**합니다.\n\n## 무엇을 말하는가\n\n- 유효한 분석 절차를 보존합니다.\n- 실패한 경로는 안전장치로 기록합니다."
  await Promise.all([mkdir(documents, { recursive: true }), mkdir(evidence, { recursive: true })])
  await copyFile(fixture, join(documents, `${hash}.pdf`))
  await writeFile(
    join(store, "workspace.json"),
    JSON.stringify({
      layoutVersion: 2,
      documents: [
        {
          id,
          name: basename(fixture),
          hash,
          bytes: bytes.length,
          importedAt: "2026-08-31T00:00:00.000Z",
          pageCount: 3,
          title: "Card spacing fixture",
          authors: [],
          year: null,
          doi: null,
          overview: "Prepared local overview",
          quality: { textCharacters: 2_000, needsOcr: false, warnings: [] },
        },
      ],
      cards: [
        {
          id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
          documentId: id,
          kind: "explanation",
          title: "HealthFlow: 통제된 경험 재사용으로 자율 EHR 분석을 자동화하는 방법",
          body: cardBody,
          x: 880,
          y: 180,
          width: 340,
          height: 560,
          minimized: false,
          loading: false,
          chat: [
            { role: "user", content: "이 결론의 근거는?" },
            { role: "assistant", content: "데이터셋 제약과 평가 궤적을 함께 보존한다는 점입니다." },
          ],
          anchor: {
            page: 1,
            quote: "HealthFlow source paragraph",
            x: 500,
            y: 220,
            fragments: [{ x: 420, y: 200, width: 160, height: 18 }],
          },
        },
      ],
      insights: [],
      sidebarOpen: true,
      outlineWidth: 240,
      researchSidebarWidth: 300,
      viewport: { x: 88, y: 36, zoom: 0.9 },
      activeDocumentId: id,
    }),
  )
  const qa = await launchSimulatedAuthenticatedApplication({ userDataRoot: userData })
  const application = qa.application
  const originalClipboard = await application.evaluate(({ clipboard }) => clipboard.readText())
  try {
    const page = await application.firstWindow()
    await page.getByRole("button", { name: "Card spacing fixture 열기" }).click()
    await page.waitForSelector(".pdfViewer .page .textLayer span", { timeout: 30_000 })
    const card = page.locator('.board-card[data-kind="explanation"]')
    await expect(card).toBeVisible()
    const spacing = await card.evaluate((element) => {
      const head = element.querySelector(".card-head")
      const body = element.querySelector(".card-body")
      const chat = element.querySelector(".card-chat")
      const composer = element.querySelector(".card-chat > .chat-composer")
      const footer = element.querySelector(".card-source-footer")
      const title = element.querySelector(".card-head strong")
      const prose = element.querySelector(".card-markdown .markdown-content")
      const message = element.querySelector(".card-chat-history article .markdown-content")
      if (!head || !body || !chat || !composer || !footer || !title || !prose || !message)
        return null
      const cardStyle = getComputedStyle(element)
      const headStyle = getComputedStyle(head)
      const bodyStyle = getComputedStyle(body)
      const chatStyle = getComputedStyle(chat)
      const composerStyle = getComputedStyle(composer)
      const footerStyle = getComputedStyle(footer)
      const wrapping = [title, prose, message].map((item) => {
        const style = getComputedStyle(item)
        return [style.wordBreak, style.overflowWrap]
      })
      return {
        radius: cardStyle.borderRadius,
        head: [headStyle.paddingTop, headStyle.paddingRight],
        body: [bodyStyle.paddingTop, bodyStyle.paddingRight, bodyStyle.paddingBottom],
        chat: [chatStyle.marginTop, chatStyle.paddingTop],
        composer: [
          composerStyle.paddingTop,
          composerStyle.paddingRight,
          composerStyle.borderRadius,
        ],
        footer: [footerStyle.paddingTop, footerStyle.paddingRight, footerStyle.paddingLeft],
        wrapping,
      }
    })
    expect(spacing).toEqual({
      radius: "12px",
      head: ["12px", "16px"],
      body: ["16px", "16px", "24px"],
      chat: ["20px", "16px"],
      composer: ["10px", "12px", "12px"],
      footer: ["10px", "32px", "16px"],
      wrapping: [
        ["keep-all", "break-word"],
        ["keep-all", "break-word"],
        ["keep-all", "break-word"],
      ],
    })
    await page.screenshot({ path: join(evidence, "research-card-spacing.png") })
    await card.screenshot({ path: join(evidence, "research-card-spacing-card.png") })
    await card.getByRole("button", { name: "카드 내용 복사" }).click()
    await expect(card.getByRole("button", { name: "카드 내용 복사됨" })).toBeVisible()
    expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe(cardBody)
    await card.screenshot({ path: join(evidence, "research-card-copy-action.png") })
    const responseStatus = card.locator(".chat-response-status")
    await expect(responseStatus).toBeHidden()
    await responseStatus.evaluate((element) => {
      element.setAttribute("data-active", "true")
      element.setAttribute("aria-hidden", "false")
    })
    await expect(responseStatus).toBeVisible()
    await expect(responseStatus).toHaveText("논문 근거를 확인하는 중…")
    expect(await responseStatus.evaluate((element) => getComputedStyle(element).color)).toBe(
      "rgb(101, 109, 120)",
    )
    await card.screenshot({ path: join(evidence, "research-card-response-status.png") })
  } finally {
    await application.evaluate(
      ({ clipboard }, value) => clipboard.writeText(value),
      originalClipboard,
    )
    await qa.close()
    await rm(root, { recursive: true, force: true })
  }
})
