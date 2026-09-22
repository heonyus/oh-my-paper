import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { expect, test } from "@playwright/test"
import type { ExportFormat } from "../../../src/shared/exportIpc"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

const execFileAsync = promisify(execFile)
const formats: readonly (readonly [ExportFormat, string])[] = [
  ["markdown", "md"],
  ["html", "html"],
  ["docx", "docx"],
  ["pdf", "pdf"],
]

test("real Electron export preserves a synthetic Korean note across four formats", async ({
  isMobile,
}, testInfo) => {
  expect(isMobile).toBe(false)
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-export-consumer-"))
  const exportRoot = join(temporaryRoot, "exports")
  const evidenceRoot = testInfo.outputPath("artifacts")
  await mkdir(exportRoot, { recursive: true })
  await mkdir(evidenceRoot, { recursive: true })
  const qa = await launchSimulatedAuthenticatedApplication()
  const title = "수출 검증 노트"
  const source = [
    "# 수출 검증 노트",
    "",
    "한국어 본문: 실제 Electron IPC와 렌더러 경로를 검증합니다.",
    "",
    "$$",
    "E=mc^2",
    "$$",
    "",
    "$$",
    String.raw`\frac{a}{b}`,
    "$$",
    "",
    "- 첫 번째 항목",
    "- 두 번째 항목",
    "",
    "| 항목 | 값 |",
    "| --- | --- |",
    "| 정확도 | 0.81 |",
  ].join("\n")

  try {
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    const note = await page.evaluate(
      async ({ title: noteTitle, body }) => {
        const knowledge = window.ohmypaper.knowledge
        if (!knowledge) throw new Error("Knowledge preload is unavailable")
        return knowledge.createNode({ kind: "note", title: noteTitle, body })
      },
      { title, body: source },
    )
    expect(note.title).toBe(title)
    expect(note.body).toBe(source)

    const more = page.getByRole("button", { name: "더 보기", exact: true })
    if (await more.isVisible()) await more.click()
    await page.getByRole("button", { name: "데이터 가져오기·내보내기" }).click()
    const dialog = page.getByRole("dialog", { name: "데이터 가져오기·내보내기" })
    await expect(dialog).toBeVisible()
    const noteSelect = page.getByRole("combobox", { name: "내보낼 노트" })
    await expect(noteSelect.locator("option").filter({ hasText: title })).toHaveCount(1)
    await noteSelect.selectOption(note.id)

    const paths = new Map<string, string>()
    for (const [format, extension] of formats) {
      const target = join(exportRoot, `${format}.${extension}`)
      paths.set(format, target)
      await page.selectOption("#export-format", format)
      const exportPanel = dialog.locator('[aria-labelledby="export-panel-title"]')
      await exportPanel.getByRole("button", { name: "미리보기", exact: true }).click()
      await expect(exportPanel.getByRole("region", { name: "내보내기 미리보기" })).toContainText(
        title,
      )

      await qa.application.evaluate(({ dialog: nativeDialog }, filePath) => {
        nativeDialog.showSaveDialog = async () => ({ canceled: false, filePath })
      }, target)
      await exportPanel.getByRole("button", { name: "파일로 저장", exact: true }).click()
      await expect(page.getByRole("status").filter({ hasText: "저장 완료" })).toBeVisible({
        timeout: 30_000,
      })
      expect((await stat(target)).size).toBeGreaterThan(0)
    }

    const markdownPath = paths.get("markdown")
    if (!markdownPath) throw new Error("Markdown path was not recorded")
    const markdown = await readFile(markdownPath, "utf8")
    expect(markdown).toContain("# 수출 검증 노트")
    expect(markdown).toContain("한국어 본문: 실제 Electron IPC와 렌더러 경로를 검증합니다.")
    expect(markdown).toContain("E=mc^2")
    expect(markdown).toContain("첫 번째 항목")
    expect(markdown).toContain("정확도")
    expect(markdown).toContain("$$")

    const htmlPath = paths.get("html")
    if (!htmlPath) throw new Error("HTML path was not recorded")
    const html = await readFile(htmlPath, "utf8")
    expect(html).toContain("한국어 본문: 실제 Electron IPC와 렌더러 경로를 검증합니다.")
    expect(html).toContain("<ul>")
    expect(html).toContain("<table>")
    expect(html).toContain("<math")
    expect(html).toContain("E=mc^2")

    const docxPath = paths.get("docx")
    if (!docxPath) throw new Error("DOCX path was not recorded")
    await execFileAsync("unzip", ["-t", docxPath])
    const documentXml = await execFileAsync("unzip", ["-p", docxPath, "word/document.xml"])
    const media = await execFileAsync("unzip", ["-Z1", docxPath])
    expect(documentXml.stdout).toContain("수출 검증 노트")
    expect(documentXml.stdout).toContain("한국어 본문")
    expect(documentXml.stdout).toContain("<w:tbl>")
    expect(documentXml.stdout).toContain("LaTeX: E=mc^2")
    expect(documentXml.stdout).toContain("LaTeX: \\frac{a}{b}")
    const mathImages = media.stdout
      .split(/\s+/u)
      .filter((entry) => entry.startsWith("word/media/") && entry.endsWith(".png"))
    expect(mathImages).toHaveLength(2)

    const pdfPath = paths.get("pdf")
    if (!pdfPath) throw new Error("PDF path was not recorded")
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const pdfLoadingTask = pdfjs.getDocument({
      data: Uint8Array.from(await readFile(pdfPath)),
    })
    const pdf = await pdfLoadingTask.promise
    const pdfPage = await pdf.getPage(1)
    const content = await pdfPage.getTextContent()
    const pdfText = content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ")
    const normalizedPdfText = pdfText.replace(/\s+/gu, "")
    const viewport = pdfPage.getViewport({ scale: 1 })
    expect(normalizedPdfText).toContain("수출검증노트")
    expect(normalizedPdfText).toContain("한국어본문:실제ElectronIPC와렌더러경로를검증합니다.")
    expect(normalizedPdfText).toContain("𝐸=𝑚𝑐2")
    expect(viewport.width).toBeCloseTo(595.28, 0)
    expect(viewport.height).toBeCloseTo(841.89, 0)
    expect(pdf.numPages).toBeGreaterThanOrEqual(1)
    await pdfLoadingTask.destroy()

    for (const [format, extension] of formats) {
      const path = paths.get(format)
      if (!path) throw new Error(`Missing ${format} artifact path`)
      await copyFile(path, join(evidenceRoot, `${format}.${extension}`))
    }
    await page.screenshot({ path: testInfo.outputPath("export-preview.png") })
    await writeFile(
      testInfo.outputPath("export-evidence.json"),
      JSON.stringify(
        {
          authMode: qa.authMode,
          noteId: note.id,
          formats: formats.map(([format]) => format),
          pdf: {
            pages: pdf.numPages,
            width: viewport.width,
            height: viewport.height,
            extractedText: pdfText,
          },
        },
        null,
        2,
      ),
    )
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
