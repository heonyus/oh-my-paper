import { expect, type Locator, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

test("document-first note editing keeps identity, save state, and populated visual evidence", async ({
  isMobile,
}, testInfo) => {
  expect(isMobile).toBe(false)
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await page.getByRole("button", { name: "지식", exact: true }).click()

    await page.getByRole("combobox", { name: "지식 종류 필터" }).selectOption("concept")
    await page.getByRole("button", { name: "생성", exact: true }).click()
    await page.getByRole("button", { name: "편집", exact: true }).click()
    const conceptTitle = page.getByRole("textbox", { name: "제목 수정" })
    await conceptTitle.click()
    await conceptTitle.press("Meta+a")
    await page.keyboard.insertText("FlashAttention")
    await conceptTitle.press("Tab")
    await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "저장", exact: true }).click()

    await page.getByRole("combobox", { name: "지식 종류 필터" }).selectOption("note")
    await page.getByRole("button", { name: "생성", exact: true }).click()
    const title = page.getByRole("textbox", { name: "제목 수정" })
    const body = page.getByRole("textbox", { name: "본문 내용 수정" })
    await title.click()
    await title.press("Meta+a")
    await page.keyboard.insertText("한국어 연구 노트")
    await body.click()

    const editor = page.locator(".cm-editor")
    await editor.evaluate((element) => {
      element.setAttribute("data-qa-editor-identity", "initial")
    })
    const chunks = [
      "# 한국어 연구 기록\n\n",
      "- 첫 번째 관찰\n- 두 번째 관찰\n\n",
      "$$\n\\frac{1}{2}\n$$\n\n",
      "| 조건 | 값 |\n| --- | --- |\n| 언어 | 한국어 |\n",
    ]
    await body.fill(chunks.join(""))
    await page.keyboard.press("Meta+End")
    await page.keyboard.insertText("\n\n[[Fla")
    await page.locator(".note-editor-completions").getByRole("option").click()

    const editorHandle = await editor.elementHandle()
    if (!editorHandle) throw new Error("CodeMirror editor did not mount")
    await expect(editor).toHaveAttribute("data-qa-editor-identity", "initial")
    await expect(page.locator(".cm-content")).not.toHaveText("")
    await expect(page.locator(".note-live-heading")).toHaveText("한국어 연구 기록")
    await expect(page.locator(".note-rich-math-display")).toBeVisible()
    await page.locator(".cm-content").click()
    await page.locator(".cm-content").press("Meta+End")
    await page.keyboard.insertText("\n")
    await page.locator(".cm-content").press("Meta+End")
    await title.click()
    const editorScroller = page.locator(".cm-scroller")
    await editorScroller.hover()
    await page.mouse.wheel(0, 2000)
    await expect(page.locator(".note-rich-table-wrap")).toBeVisible()
    await page.mouse.wheel(0, 2000)
    await expect(page.locator(".note-rich-link")).toContainText("Fla")
    await editorScroller.evaluate((element) => {
      element.scrollTop = 0
      element.dispatchEvent(new Event("scroll"))
    })
    await page.getByRole("button", { name: "소스 보기", exact: true }).click()
    await expect(page.locator(".cm-content")).toContainText("| 조건 | 값 |")
    await page.getByRole("button", { name: "라이브", exact: true }).click()

    await page.locator(".cm-content").click()
    await page.keyboard.press("Meta+s")
    await expect(editor).toBeVisible()
    await expect(page.locator(".cm-content")).toBeFocused()
    await expect(editor).toHaveAttribute("data-qa-editor-identity", "initial")
    await expect(page.locator(".cm-content")).toContainText("한국어 연구 기록")

    await expect
      .poll(async () => {
        const matches = await page.evaluate(async () =>
          window.scourgify.knowledge.findNodes({ search: "한국어 연구 노트" }),
        )
        return matches.find((node) => node.title === "한국어 연구 노트")?.body ?? null
      })
      .toContain("한국어 연구 기록")

    await page.getByRole("combobox", { name: "지식 종류 필터" }).selectOption("all")
    await page.getByRole("button", { name: "개념 FlashAttention", exact: true }).click()
    await expect(page.getByRole("heading", { name: "FlashAttention", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "노트 한국어 연구 노트", exact: true }).click()
    await expect(page.getByRole("textbox", { name: "본문 내용 수정" })).toBeVisible()
    await expect(page.locator(".cm-content")).toContainText("한국어 연구 기록")

    const details = page.locator("details.knowledge-note-details")
    const insert = page.locator("details.note-editor-insert")
    const relations = page.getByRole("region", { name: "연결 및 백링크", exact: true })
    const noteDetailPane = page.getByRole("region", { name: "지식 상세 내용", exact: true })
    const knowledgeMainPane = page
      .getByRole("region", { name: "노트와 지식", exact: true })
      .getByRole("main")
    const resetPaneScroll = async (): Promise<void> => {
      for (const pane of [noteDetailPane, knowledgeMainPane]) {
        await pane.evaluate((element) => {
          element.scrollTop = 0
          element.dispatchEvent(new Event("scroll", { bubbles: true }))
        })
      }
    }
    const getDetailScroller = async (): Promise<Locator> => {
      const isScrollable = (element: HTMLElement): boolean =>
        element.scrollHeight > element.clientHeight
      if (await noteDetailPane.evaluate(isScrollable)) return noteDetailPane
      if (await knowledgeMainPane.evaluate(isScrollable)) return knowledgeMainPane
      throw new Error("No note detail pane has scrollable overflow")
    }
    const setDetailsOpen = async (detail: Locator, open: boolean): Promise<void> => {
      const isOpen = await detail.evaluate((element) => element.hasAttribute("open"))
      if (isOpen !== open) await detail.locator("summary").click()
      if (open) await expect(detail).toHaveAttribute("open", "")
      else await expect(detail).not.toHaveAttribute("open")
    }
    await setDetailsOpen(details, true)
    await setDetailsOpen(insert, true)
    await expect(relations).toBeVisible()

    await page.getByRole("button", { name: "설정" }).click()
    await page.getByRole("button", { name: "일반" }).click()
    await page.selectOption("#appearance-theme", "light")
    await page.getByRole("button", { name: "설정 닫기" }).click()
    await setDetailsOpen(details, false)
    await setDetailsOpen(insert, false)
    await resetPaneScroll()
    await page.screenshot({ path: testInfo.outputPath("note-light-100.png") })

    await page.getByRole("button", { name: "설정" }).click()
    await page.getByRole("button", { name: "일반" }).click()
    await page.selectOption("#appearance-theme", "dark")
    await page.getByRole("button", { name: "설정 닫기" }).click()
    await setDetailsOpen(details, false)
    await setDetailsOpen(insert, false)
    await resetPaneScroll()
    await page.screenshot({ path: testInfo.outputPath("note-dark-100.png") })

    await setDetailsOpen(details, true)
    await setDetailsOpen(insert, false)
    await expect(relations).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath("note-dark-metadata-expanded.png") })
    await setDetailsOpen(details, false)
    await setDetailsOpen(insert, true)
    await expect(relations).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath("note-dark-insert-expanded.png") })
    await setDetailsOpen(details, false)
    await setDetailsOpen(insert, false)
    await expect(relations).toBeVisible()
    const backlinksHeading = relations.getByRole("heading", { name: "연결 및 백링크", exact: true })
    await backlinksHeading.scrollIntoViewIfNeeded()
    await expect(backlinksHeading).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath("note-dark-backlinks-expanded.png") })

    await page.getByRole("button", { name: "소스 보기", exact: true }).click()
    await expect(page.locator(".cm-editor")).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath("note-dark-source.png") })
    await page.getByRole("button", { name: "라이브", exact: true }).click()
    await setDetailsOpen(details, false)
    await setDetailsOpen(insert, false)
    await expect(relations).toBeVisible()

    const browserWindow = await qa.application.browserWindow(page)
    await browserWindow.evaluate((window) => window.setContentSize(760, 700))
    await page.getByRole("button", { name: "설정" }).click()
    await page.getByRole("button", { name: "일반" }).click()
    await page.getByRole("button", { name: "200%" }).click()
    await page.getByRole("button", { name: "설정 닫기" }).click()
    await setDetailsOpen(details, false)
    await setDetailsOpen(insert, true)
    await expect(relations).toBeVisible()
    await expect(insert).toHaveAttribute("open", "")
    await resetPaneScroll()
    await page.screenshot({ path: testInfo.outputPath("note-narrow-200-top-insert-expanded.png") })
    const detailScroller = await getDetailScroller()
    await detailScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      element.dispatchEvent(new Event("scroll", { bubbles: true }))
    })
    const saveButton = page.getByRole("button", { name: "저장", exact: true })
    await saveButton.scrollIntoViewIfNeeded()
    await expect(saveButton).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath("note-narrow-200-bottom-insert-expanded.png"),
    })
  } finally {
    await qa.close()
  }
})
