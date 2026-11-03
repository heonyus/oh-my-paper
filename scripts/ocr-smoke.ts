// Reads one page with the installed document engine (PaddleOCR-VL), end to end: the runtime that
// `npm run setup:paddle-vl` installed, the worker the app starts and the page it returns. The
// Windows workflow runs it after installing the engine; it works wherever the engine is installed.
//
//   node --import tsx scripts/ocr-smoke.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { importPaths } from "../src/electron/documentImportIpc"
import { PaddlePageParserService } from "../src/electron/paddlePageParserService"
import { defaultWorkspace, WorkspaceStore } from "../src/electron/workspaceStore"

const appRoot = fileURLToPath(new URL("..", import.meta.url))

/** A page of plain English the engine has to find: a title and a short paragraph. */
async function samplePage(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([612, 792])
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const regular = await document.embedFont(StandardFonts.Helvetica)
  page.drawText("Reading Papers Locally", { x: 72, y: 700, size: 24, font: bold })
  const lines = [
    "Every passage stays on this computer. The engine finds the title,",
    "this paragraph and their order on the page, so a translation or a",
    "note can sit beside the exact sentence it came from.",
  ]
  for (const [index, line] of lines.entries()) {
    page.drawText(line, {
      x: 72,
      y: 650 - index * 18,
      size: 12,
      font: regular,
      color: rgb(0.1, 0.1, 0.1),
    })
  }
  return document.save()
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-ocr-smoke-"))
  const store = new WorkspaceStore(root)
  const parser = new PaddlePageParserService({
    appPath: appRoot,
    resourcesPath: appRoot,
    packaged: false,
  })
  try {
    const status = await parser.status()
    console.log(`engine: ${JSON.stringify(status)}`)
    if (!status.configured) throw new Error("the document engine is not installed")

    await store.save(defaultWorkspace())
    const pdf = join(root, "sample.pdf")
    await writeFile(pdf, await samplePage())
    const noEvents = { sender: { send: () => undefined } }
    const [imported] = await importPaths(
      noEvents,
      [pdf],
      { schedule: async () => undefined },
      store,
    )
    if (!imported) throw new Error("the sample PDF did not import")

    const started = Date.now()
    const result = await parser.parse({
      documentId: imported.document.id,
      pageNumber: 1,
      store,
      onProgress: (progress) => console.log(`progress: ${JSON.stringify(progress)}`),
    })
    const seconds = Math.round((Date.now() - started) / 1000)
    if (result.status !== "ready") throw new Error(`no page after ${seconds}s: ${result.reason}`)
    const text = result.page.blocks.map((block) => block.content).join("\n")
    console.log(`page read in ${seconds}s: ${result.page.blocks.length} blocks`)
    console.log(text.slice(0, 600))
    for (const expected of ["Reading Papers Locally", "translation"]) {
      if (!text.toLowerCase().includes(expected.toLowerCase()))
        throw new Error(`the page does not say "${expected}"`)
    }
    console.log("ok")
  } finally {
    parser.dispose()
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
    process.exit(1)
  },
)
