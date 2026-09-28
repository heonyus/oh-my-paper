import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("saving a translation annotation leaves only its source highlight and sidebar entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-translation-annotation-"))
  const userData = join(root, "user-data")
  const store = join(userData, "ohmypaper")
  const documents = join(store, "documents")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const hash = createHash("sha256").update(bytes).digest("hex")
  const id = hash.slice(0, 16)
  const evidence = join(process.cwd(), ".omo", "evidence", "translation-annotation")
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
          title: "Translation annotation fixture",
          authors: [],
          year: null,
          doi: null,
          overview: "Prepared local overview",
          quality: { textCharacters: 2_000, needsOcr: false, warnings: [] },
        },
      ],
      cards: [
        {
          id: "63fcb8ab-9085-4f88-af36-f4d25cdd2363",
          documentId: id,
          kind: "note",
          title: "번역 주석",
          body: "1. **깨지기 쉬운**\n2. 취약한\n3. 여린",
          x: 900,
          y: 480,
          minimized: false,
          loading: false,
          chat: [],
          anchor: {
            page: 1,
            quote: "brittle",
            x: 500,
            y: 420,
            fragments: [{ x: 420, y: 400, width: 72, height: 18 }],
          },
        },
        {
          id: "83fcb8ab-9085-4f88-af36-f4d25cdd2365",
          documentId: id,
          kind: "note",
          title: "번역 주석",
          body: "1. **통제된**\n2. 관리되는\n3. 규율된",
          x: 900,
          y: 720,
          minimized: false,
          loading: false,
          chat: [],
          anchor: {
            page: 1,
            quote: "governed",
            x: 500,
            y: 620,
            fragments: [{ x: 420, y: 600, width: 78, height: 18 }],
          },
        },
        {
          id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
          documentId: id,
          kind: "translation",
          title: "empowered",
          body: "**능력을 갖추고 있는**",
          x: 900,
          y: 240,
          minimized: false,
          width: 300,
          height: 220,
          loading: false,
          chat: [],
          anchor: {
            page: 1,
            quote: "empowered",
            x: 500,
            y: 220,
            fragments: [{ x: 420, y: 200, width: 80, height: 18 }],
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
  try {
    const page = await application.firstWindow()
    const browserWindow = await application.browserWindow(page)
    await page.getByRole("button", { name: "Translation annotation fixture 열기" }).click()
    await page.waitForSelector(".pdfViewer .page .textLayer span", { timeout: 30_000 })
    const card = page.getByLabel("empowered, 1 페이지 연결 카드")
    const sourceJump = card.getByRole("button", { name: "p. 1 원문으로 이동" })
    await expect(sourceJump.locator("xpath=ancestor::footer[1]")).toHaveClass("card-source-footer")
    const before = await browserWindow.evaluate(async (windowHandle) =>
      (await windowHandle.capturePage()).toDataURL(),
    )
    await writeFile(
      join(evidence, "translation-footer-before.png"),
      before.replace(/^data:image\/png;base64,/u, ""),
      "base64",
    )

    await card.getByRole("button", { name: "번역을 주석으로 저장" }).click()

    await expect(card).toBeHidden()
    await expect(page.locator(".highlight-mark > span")).toHaveCount(3)
    await expect(page.locator(".connector-layer path")).toHaveCount(0)
    await page.getByRole("button", { name: "하이라이트 모드" }).click()
    await expect(page.locator(".board-index-list > li")).toHaveCount(3)
    await expect(page.getByText("번역 주석")).toHaveCount(0)
    await expect(page.locator(".board-index-list .board-index-icon")).toHaveCount(0)
    await expect(page.getByText("보드에서 편집")).toHaveCount(0)
    await expect(page.getByText("깨지기 쉬운")).toBeVisible()
    await expect(page.getByText("통제된")).toBeVisible()
    await expect(page.getByText("능력을 갖추고 있는")).toBeVisible()
    await expect(page.getByText("empowered", { exact: true })).toBeVisible()
    const rowGaps = await page.locator(".board-index-list > li").evaluateAll((items) =>
      items.flatMap((item, index) => {
        const previous = items[index - 1]
        return previous
          ? [item.getBoundingClientRect().top - previous.getBoundingClientRect().bottom]
          : []
      }),
    )
    expect(rowGaps.every((gap) => gap >= 11)).toBe(true)
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.ohmypaper.readWorkspace())).cards.map(
          (storedCard) => storedCard.kind,
        ),
      )
      .toEqual(["highlight", "highlight", "highlight"])
    const after = await browserWindow.evaluate(async (windowHandle) =>
      (await windowHandle.capturePage()).toDataURL(),
    )
    await writeFile(
      join(evidence, "highlight-sidebar-after.png"),
      after.replace(/^data:image\/png;base64,/u, ""),
      "base64",
    )
  } finally {
    await qa.close()
    await rm(root, { recursive: true, force: true })
  }
})
