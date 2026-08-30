import { chromium } from "playwright"

const endpoint = process.env.SCOURGIFY_CDP_ENDPOINT ?? "http://127.0.0.1:9225"
const documentId = "c1293aa46fae8610"
const targets = [
  [1, "Figure 1"],
  [5, "Figure 2"],
  [8, "Table 4"],
  [8, "Figure 4"],
  [9, "Table 5"],
  [20, "Table 6"],
  [22, "Figure 9"],
  [25, "Table 7"],
  [27, "Figure 11"],
  [27, "Figure 12"],
  [30, "Table 11"],
]

const version = await fetch(`${endpoint}/json/version`).then((response) => response.json())
const browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl)
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .at(-1)
if (!page) throw new Error("Scourgify page is not open")
await page.waitForSelector(".pdfViewer .page", { timeout: 30_000 })
const layout = await page.evaluate(
  async (value) => window.scourgify.readDocumentLayout(value),
  documentId,
)
if (layout.status !== "ready" || layout.layout.version !== 2 || layout.layout.pages.length !== 43) {
  throw new Error("PP-DocLayout v2 cache is not ready")
}

const geometry = []
for (const [pageNumber, name] of targets) {
  await page.waitForFunction(
    ({ targetPage, targetName }) => {
      const host = document.querySelector(
        `.paper-structure-host>[data-page-number="${targetPage}"]`,
      )
      return Array.from(host?.querySelectorAll(".structure-hover-region") ?? []).some((item) =>
        item.querySelector("button")?.getAttribute("aria-label")?.includes(targetName),
      )
    },
    { targetPage: pageNumber, targetName: name },
    { timeout: 30_000 },
  )
  const result = await page.evaluate(
    ({ targetPage, targetName }) => {
      const host = document.querySelector(
        `.paper-structure-host>[data-page-number="${targetPage}"]`,
      )
      const region = Array.from(host?.querySelectorAll(".structure-hover-region") ?? []).find(
        (item) => item.querySelector("button")?.getAttribute("aria-label")?.includes(targetName),
      )
      if (!(region instanceof HTMLElement)) return null
      const regionRect = region.getBoundingClientRect()
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: regionRect.left + regionRect.width / 2,
          clientY: regionRect.top + regionRect.height / 2,
          bubbles: true,
        }),
      )
      const cluster = region.querySelector(".structure-action-cluster")
      const pdfPage = document.querySelector(`.pdfViewer .page[data-page-number="${targetPage}"]`)
      if (!(cluster instanceof HTMLElement) || !(pdfPage instanceof HTMLElement)) return null
      const clusterRect = cluster.getBoundingClientRect()
      const overlap = (left, right) =>
        Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
        Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
      return {
        page: targetPage,
        name: targetName,
        objectOverlap: overlap(regionRect, clusterRect),
        textOverlaps: Array.from(pdfPage.querySelectorAll(".textLayer span")).filter(
          (span) => overlap(clusterRect, span.getBoundingClientRect()) > 0,
        ).length,
      }
    },
    { targetPage: pageNumber, targetName: name },
  )
  if (!result) throw new Error(`Missing target: p.${pageNumber} ${name}`)
  if (result.objectOverlap !== 0 || result.textOverlaps !== 0) {
    throw new Error(`Geometry overlap: p.${pageNumber} ${name}`)
  }
  geometry.push(result)
}
process.stdout.write(
  `${JSON.stringify({ model: layout.layout.model, version: layout.layout.version, geometry })}\n`,
)
process.exit(0)
