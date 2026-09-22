import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("groups Paddle multi-panel blocks into one stable Figure target", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-parsed-figure-"))
  const userData = join(temporaryRoot, "user-data")
  const storeRoot = join(userData, "ohmypaper")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const hash = createHash("sha256").update(bytes).digest("hex")
  const id = hash.slice(0, 16)
  await mkdir(join(storeRoot, "documents"), { recursive: true })
  await copyFile(fixture, join(storeRoot, "documents", `${hash}.pdf`))
  await writeFile(
    join(storeRoot, "workspace.json"),
    JSON.stringify({
      documents: [
        {
          id,
          name: basename(fixture),
          hash,
          bytes: bytes.length,
          importedAt: "2026-09-03T00:00:00.000Z",
          pageCount: 3,
          title: "Multi-panel geometry fixture",
          authors: [],
          year: null,
          doi: null,
          quality: { textCharacters: 100, needsOcr: false, warnings: [] },
        },
      ],
      cards: [],
      sidebarOpen: false,
      viewport: { x: 88, y: 36, zoom: 0.8 },
      activeDocumentId: id,
    }),
  )
  const parsedRoot = join(storeRoot, "parsed-pages", hash, "paddleocr-vl-1.6-page-v1")
  await mkdir(parsedRoot, { recursive: true })
  await writeFile(
    join(parsedRoot, "page-1.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      sourceHash: hash,
      parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v1",
      pageNumber: 1,
      width: 1_200,
      height: 1_600,
      blocks: [
        {
          id: "page:1:block:0",
          label: "figure_title",
          order: 0,
          bounds: { x: 120, y: 180, width: 240, height: 30 },
          content: "a Data preparation",
          contentFormat: "markdown",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:1",
          label: "image",
          order: 1,
          bounds: { x: 100, y: 220, width: 1_000, height: 300 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:2",
          label: "chart",
          order: 2,
          bounds: { x: 760, y: 240, width: 300, height: 240 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:3",
          label: "image",
          order: 3,
          bounds: { x: 120, y: 610, width: 450, height: 260 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
        {
          id: "page:1:block:4",
          label: "image",
          order: 4,
          bounds: { x: 630, y: 600, width: 450, height: 270 },
          content: "",
          contentFormat: "none",
          translationPolicy: "exclude",
        },
      ],
    }),
  )
  const qa = await launchSimulatedAuthenticatedApplication({ userDataRoot: userData })
  try {
    const page = await qa.application.firstWindow()
    await page.getByRole("button", { name: "Multi-panel geometry fixture 열기" }).click()
    const figures = page.locator('.structure-hover-region[data-kind="figure"]')
    await expect(figures).toHaveCount(1)
    const region = await figures.boundingBox()
    const paper = await page.locator('.pdfViewer .page[data-page-number="1"]').boundingBox()
    if (!region || !paper) throw new Error("grouped figure geometry is missing")
    expect(region.width / paper.width).toBeGreaterThan(0.75)
    expect(region.height / paper.height).toBeGreaterThan(0.38)
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
