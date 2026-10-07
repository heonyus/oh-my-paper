import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("the reader note takes pasted and picked images and opens its slash menu on screen", async () => {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-note-image-"))
  const userData = join(root, "user-data")
  const store = join(userData, "ohmypaper")
  const documents = join(store, "documents")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const hash = createHash("sha256").update(bytes).digest("hex")
  const id = hash.slice(0, 16)
  const evidence = join(process.cwd(), "test-results", "evidence", "reader-note-image")
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
          title: "Note image fixture",
          authors: [],
          year: null,
          doi: null,
          overview: "Prepared local overview",
          quality: { textCharacters: 2_000, needsOcr: false, warnings: [] },
        },
      ],
      cards: [],
      insights: [],
      sidebarOpen: true,
      outlineWidth: 240,
      researchSidebarWidth: 300,
      viewport: { x: 88, y: 36, zoom: 0.9 },
      activeDocumentId: id,
    }),
  )
  const picked = join(root, "picked.png")
  const qa = await launchSimulatedAuthenticatedApplication({
    userDataRoot: userData,
    configuredProvider: true,
  })
  const application = qa.application
  try {
    const page = await application.firstWindow()
    await page.getByRole("button", { name: "Note image fixture 열기" }).click()
    await page.waitForSelector(".pdfViewer .page .textLayer span", { timeout: 30_000 })

    // Quote a line into the note, which opens it.
    await page.evaluate(() => {
      const span = [...document.querySelectorAll(".textLayer span")].find((item) =>
        item.textContent?.includes("Scientific inquiry"),
      )
      const text = span?.firstChild
      if (!text) throw new Error("fixture text missing")
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 18)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
    })
    await page.locator(".selection-menu").getByRole("button", { name: "노트에" }).click()
    const note = page.getByRole("region", { name: "내 노트" })
    const prose = note.locator(".note-prose")
    await expect(prose).toContainText("Scientific inquiry")

    // The slash menu opens beside the cursor, inside the window, and offers images here.
    await prose.click()
    await page.keyboard.press("Meta+ArrowDown")
    await page.keyboard.type("/")
    const menu = page.getByRole("listbox", { name: "블록 추가" })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole("option", { name: /이미지/u })).toBeVisible()
    const menuBox = await menu.boundingBox()
    const noteBox = await note.boundingBox()
    const windowHeight = await page.evaluate(() => window.innerHeight)
    expect(
      menuBox && noteBox && menuBox.x >= noteBox.x && menuBox.x < noteBox.x + noteBox.width,
    ).toBe(true)
    expect(menuBox && menuBox.y + menuBox.height <= windowHeight).toBe(true)
    await page.keyboard.press("Escape")
    await page.keyboard.press("Backspace")

    // A pasted screenshot goes in as an image kept in the collection.
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas")
      canvas.width = 240
      canvas.height = 120
      const context = canvas.getContext("2d")
      if (!context) throw new Error("no canvas")
      context.fillStyle = "#3ecf8e"
      context.fillRect(0, 0, 240, 120)
      context.fillStyle = "#17251f"
      context.fillRect(20, 20, 80, 80)
      return canvas.toDataURL("image/png")
    })
    // The harness stubs the system clipboard, so the paste carries the image itself.
    await prose.evaluate((element, dataUrl) => {
      const bytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (char) => char.charCodeAt(0))
      const data = new DataTransfer()
      data.items.add(new File([bytes], "screenshot.png", { type: "image/png" }))
      element.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      )
    }, png)
    const images = prose.locator('img[src^="scourgify-asset://local/assets/"]')
    await expect(images).toHaveCount(1)
    await expect
      .poll(() => images.first().evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)

    // `/image` asks for a file and puts it in the note.
    await writeFile(picked, Buffer.from(png.replace(/^data:image\/png;base64,/u, ""), "base64"))
    await application.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, picked)
    await page.keyboard.press("Enter")
    await page.keyboard.type("/image")
    await page.keyboard.press("Enter")
    await expect(images).toHaveCount(2)

    await expect
      .poll(async () => {
        const workspace = await page.evaluate(() => window.ohmypaper.readWorkspace())
        return workspace.readerNotes.find((item) => item.documentId === id)?.markdown ?? ""
      })
      .toMatch(
        /!\[\]\(\.\.\/assets\/[a-f0-9]{64}\.png\)[\s\S]*!\[\]\(\.\.\/assets\/[a-f0-9]{64}\.png\)/u,
      )
    await page.screenshot({ path: join(evidence, "reader-note-images.png") })
  } finally {
    await qa.close()
    await rm(root, { recursive: true, force: true })
  }
})
