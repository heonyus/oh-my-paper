import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("a translation is drawn on its passage and shows its text on hover", async () => {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-translation-annotation-"))
  const userData = join(root, "user-data")
  const store = join(userData, "ohmypaper")
  const documents = join(store, "documents")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const hash = createHash("sha256").update(bytes).digest("hex")
  const id = hash.slice(0, 16)
  const evidence = join(process.cwd(), "test-results", "evidence", "translation-annotation")
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
  const qa = await launchSimulatedAuthenticatedApplication({
    userDataRoot: userData,
    configuredProvider: true,
  })
  const application = qa.application
  try {
    const page = await application.firstWindow()
    const browserWindow = await application.browserWindow(page)
    await page.getByRole("button", { name: "Translation annotation fixture 열기" }).click()
    await page.waitForSelector(".pdfViewer .page .textLayer span", { timeout: 30_000 })

    // No card beside the page: the passage is tinted, and earlier translation notes are highlights.
    await expect(page.getByLabel("empowered, 1 페이지 연결 카드")).toHaveCount(0)
    await expect(page.locator(".translation-mark > span")).toHaveCount(1)
    await expect(page.locator(".highlight-mark > span")).toHaveCount(2)
    await expect(page.locator(".connector-layer path")).toHaveCount(0)
    const peek = page.getByRole("complementary", { name: "번역" })
    await expect(peek).toHaveCount(0)

    const mark = await page.locator(".translation-mark > span").boundingBox()
    if (!mark) throw new Error("translation mark is not drawn")
    await page.mouse.move(mark.x + mark.width / 2 - 6, mark.y + mark.height / 2)
    await page.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2)
    await expect(peek).toBeVisible()
    await expect(peek).toContainText("능력을 갖추고 있는")
    const peekBox = await peek.boundingBox()
    expect(peekBox && peekBox.y + peekBox.height <= mark.y).toBe(true)
    const shown = await browserWindow.evaluate(async (windowHandle) =>
      (await windowHandle.capturePage()).toDataURL(),
    )
    await writeFile(
      join(evidence, "translation-peek.png"),
      shown.replace(/^data:image\/png;base64,/u, ""),
      "base64",
    )

    await page.mouse.move(mark.x + mark.width / 2, mark.y + 240)
    await expect(peek).toHaveCount(0)

    await page.mouse.move(mark.x + mark.width / 2 - 6, mark.y + mark.height / 2)
    await page.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2)
    await peek.getByRole("button", { name: "번역 지우기" }).click()
    await expect(page.locator(".translation-mark")).toHaveCount(0)
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.ohmypaper.readWorkspace())).cards.map(
          (storedCard) => storedCard.kind,
        ),
      )
      .toEqual(["highlight", "highlight"])
  } finally {
    await qa.close()
    await rm(root, { recursive: true, force: true })
  }
})
