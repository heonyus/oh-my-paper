import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

test("live Markdown note preserves source through rendering, undo, save, and reopen", async () => {
  // Given
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await page.getByRole("button", { name: "지식", exact: true }).click()
    await page.getByRole("combobox", { name: "지식 종류 필터" }).selectOption("note")
    await page.getByRole("button", { name: "생성", exact: true }).click()
    const title = page.getByRole("textbox", { name: "제목 수정" })
    const body = page.getByRole("textbox", { name: "본문 내용 수정" })
    const source = [
      "intro",
      "",
      "# 라이브 노트",
      "- source-preserving",
      "`code` and $x^2$",
      "",
      "$$",
      String.raw`\frac{1}{2}`,
      "$$",
      "",
      "| 조건 | 값 |",
      "| --- | --- |",
      "| 언어 | 한국어 |",
      "",
      '<unknown keep="bytes">원문</unknown>',
      "![blocked](https://example.com/tracker.png)",
    ].join("\n")

    // When
    await title.fill("FlashAttention")
    await body.fill(source)
    await body.press("Meta+Home")

    // Then
    await expect(page.locator(".cm-content")).not.toHaveText("")
    await expect(page.locator(".note-live-heading")).toBeVisible()
    await expect(page.locator(".note-rich-math-display")).toBeVisible()
    await expect(page.locator(".note-rich-table-wrap")).toBeVisible()
    await expect(page.locator('.note-rich-image img[src^="http"]')).toHaveCount(0)
    await page.getByText("삽입 도구", { exact: true }).click()
    const { SCOURGIFY_LIVE_NOTES_SCREENSHOT: screenshotPath } = process.env
    if (screenshotPath) await page.screenshot({ path: screenshotPath })
    const editor = await page.locator(".cm-editor").elementHandle()
    if (!editor) throw new Error("CodeMirror editor did not mount")
    await page.locator(".cm-editor").evaluate((element) => {
      element.setAttribute("data-qa-editor-identity", "live-note")
    })
    await page.getByRole("button", { name: "소스 보기" }).click()
    expect((await page.locator(".cm-content .cm-line").allTextContents()).join("\n")).toBe(source)
    await page.getByRole("button", { name: "라이브", exact: true }).click()
    expect(await editor.evaluate((element) => element.isConnected)).toBe(true)

    await page.getByRole("button", { name: "저장", exact: true }).click()
    await expect(page.getByText("저장됨 · 자동 저장 안 함", { exact: true })).toBeVisible()
    await expect(page.locator(".cm-editor")).toHaveAttribute("data-qa-editor-identity", "live-note")
    await page.getByRole("button", { name: "소스 보기" }).click()
    expect((await page.locator(".cm-content .cm-line").allTextContents()).join("\n")).toBe(source)

    const content = page.locator(".cm-content")
    await content.click()
    await page.keyboard.press("Meta+End")
    await page.keyboard.insertText("\n[[Fla")
    await expect(page.locator(".note-editor-completions")).toBeVisible()
    await page.locator(".note-editor-completions").getByRole("option").click()
    const current = (await page.locator(".cm-content .cm-line").allTextContents()).join("\n")
    expect(current).not.toBe(`${source}\n[[Fla`)
    expect(current).toMatch(/\[\[[0-9a-f-]{36}\|Fla\]\]$/u)
    await body.press("Meta+z")
    expect((await page.locator(".cm-content .cm-line").allTextContents()).join("\n")).toBe(
      `${source}\n[[Fla`,
    )
  } finally {
    await qa.close()
  }
})
