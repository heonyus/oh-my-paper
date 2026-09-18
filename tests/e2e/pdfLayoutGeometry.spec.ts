import { createHash } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { basename, join } from "node:path"
import { expect, test } from "@playwright/test"
import { documentIdSchema } from "../../src/shared/schemas"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("figure and table actions stay outside PDF content", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "scourgify-e2e-"))
  const userData = join(temporaryRoot, "user-data")
  const storeRoot = join(userData, "scourgify")
  const documents = join(storeRoot, "documents")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const bytes = await readFile(fixture)
  const hash = createHash("sha256").update(bytes).digest("hex")
  const id = hash.slice(0, 16)
  const documentId = documentIdSchema.parse(id)
  await mkdir(documents, { recursive: true })
  await copyFile(fixture, join(documents, `${hash}.pdf`))
  await writeFile(
    join(storeRoot, "workspace.json"),
    JSON.stringify({
      documents: [
        {
          id,
          name: basename(fixture),
          hash,
          bytes: bytes.length,
          importedAt: new Date().toISOString(),
          pageCount: 3,
          title: "Scourgify deterministic fixture",
          authors: [],
          year: null,
          doi: null,
          quality: { textCharacters: 0, needsOcr: false, warnings: [] },
        },
      ],
      cards: [],
      sidebarOpen: false,
      viewport: { x: 88, y: 36, zoom: 0.72 },
      activeDocumentId: id,
    }),
  )
  const qa = await launchSimulatedAuthenticatedApplication({
    userDataRoot: userData,
    environment: {
      SCOURGIFY_LAYOUT_PYTHON: join(homedir(), ".scourgify", "layout-runtime", "bin", "python"),
    },
  })
  try {
    const page = await qa.application.firstWindow()
    await page.getByRole("button", { name: "Scourgify deterministic fixture 열기" }).click()
    const layout = await page.evaluate(
      async (value) => window.scourgify.readDocumentLayout(value),
      documentId,
    )
    expect(layout.status).toBe("ready")
    if (layout.status === "ready") expect(layout.layout.model).toBe("PP-DocLayout_plus-L")
    await page.waitForSelector('.structure-hover-region[data-kind="table"]', {
      state: "attached",
      timeout: 30_000,
    })
    const renderDensity = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".pdfViewer .page canvas")
      if (!canvas) return null
      const bounds = canvas.getBoundingClientRect()
      return {
        pixelRatio: window.devicePixelRatio,
        horizontal: canvas.width / bounds.width,
        vertical: canvas.height / bounds.height,
      }
    })
    expect(renderDensity).not.toBeNull()
    if (renderDensity) {
      expect(renderDensity.horizontal).toBeGreaterThanOrEqual(renderDensity.pixelRatio * 0.95)
      expect(renderDensity.vertical).toBeGreaterThanOrEqual(renderDensity.pixelRatio * 0.95)
    }
    const board = page.locator(".board-viewport")
    const tableRegion = page.locator('.structure-hover-region[data-kind="table"]')
    const boardRect = await board.boundingBox()
    const initialTableRect = await tableRegion.boundingBox()
    if (!boardRect || !initialTableRect) throw new Error("table action target is missing")
    await board.dispatchEvent("wheel", {
      deltaX: 0,
      deltaY: initialTableRect.y - boardRect.y - 100,
    })
    await expect
      .poll(async () => (await tableRegion.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(boardRect.y + boardRect.height)
    const geometry = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>(
        '.structure-hover-region[data-kind="table"]',
      )
      const cluster = region?.querySelector<HTMLElement>(".structure-action-cluster")
      const firstAction = cluster?.querySelector<HTMLElement>("button")
      const pageNumber = region
        ?.closest<HTMLElement>("[data-page-number]")
        ?.getAttribute("data-page-number")
      const pageElement = pageNumber
        ? document.querySelector<HTMLElement>(`.pdfViewer .page[data-page-number="${pageNumber}"]`)
        : null
      if (!region || !cluster || !firstAction || !pageElement) return null
      const regionRect = region.getBoundingClientRect()
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: regionRect.left + regionRect.width / 2,
          clientY: regionRect.top + regionRect.height / 2,
          bubbles: true,
        }),
      )
      const actionRect = firstAction.getBoundingClientRect()
      const overlap = (left: DOMRect, right: DOMRect): number =>
        Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
        Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
      const textOverlaps = Array.from(pageElement.querySelectorAll(".textLayer span")).filter(
        (span) => overlap(actionRect, span.getBoundingClientRect()) > 0,
      ).length
      const side = region.getAttribute("data-object-action-side")
      const targetGap =
        side === "left" ? regionRect.left - actionRect.right : actionRect.left - regionRect.right
      const midpoint = {
        x:
          side === "left"
            ? (regionRect.left + actionRect.right) / 2
            : (regionRect.right + actionRect.left) / 2,
        y: actionRect.top + actionRect.height / 2,
      }
      const corridorOwner = document.elementFromPoint(midpoint.x, midpoint.y)
      return {
        objectOverlap: overlap(regionRect, actionRect),
        textOverlaps,
        targetGap,
        midpoint,
        corridorLinked: corridorOwner?.closest(".structure-hover-region") === region,
      }
    })

    if (!geometry) throw new Error("table action geometry is missing")
    expect(geometry.objectOverlap).toBe(0)
    expect(geometry.textOverlaps).toBe(0)
    expect(geometry.targetGap).toBeGreaterThanOrEqual(0)
    expect(geometry.targetGap).toBeLessThanOrEqual(10)
    expect(geometry.corridorLinked).toBe(true)
    await page.mouse.move(geometry.midpoint.x, geometry.midpoint.y)
    await page.waitForTimeout(320)
    await expect(page.locator('.structure-hover-region[data-kind="table"]')).toHaveAttribute(
      "data-active",
      "true",
    )
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
