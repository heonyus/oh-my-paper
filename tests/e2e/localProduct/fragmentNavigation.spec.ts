import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

test("a note passage links through real IPC and returns from its backlink", async ({
  isMobile,
}, testInfo) => {
  expect(isMobile).toBe(false)
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    const ids = await page.evaluate(async () => {
      const target = await window.ohmypaper.knowledge.createNode({
        kind: "concept",
        title: "검증 방법",
      })
      const note = await window.ohmypaper.knowledge.createNode({
        kind: "note",
        title: "검토 노트",
        body: "Evidence must remain linked to its source.",
      })
      return { note: note.id, target: target.id }
    })
    await page.getByRole("button", { name: "지식", exact: true }).click()
    await page.getByRole("button", { name: "노트 검토 노트", exact: true }).click()
    const editor = page.getByRole("textbox", { name: "본문 내용 수정" })
    await editor.click()
    await editor.press("Meta+a")
    await page.getByRole("combobox", { name: "구절 연결 대상" }).selectOption(ids.target)
    await page.getByRole("button", { name: "선택한 구절 연결", exact: true }).click()
    await expect(page.getByText("선택한 구절을 연결했습니다.", { exact: true })).toBeVisible()
    const anchor = await page.evaluate(async (id) => {
      const relations = await window.ohmypaper.knowledge.findRelations({ nodeId: id })
      const endpoint = relations
        .map((relation) => relation.sourceEndpoint)
        .find((candidate) => candidate?.kind === "note-fragment")
      if (endpoint?.kind !== "note-fragment") throw new Error("Expected note fragment")
      return endpoint.anchor
    }, ids.note)
    expect(anchor.quote).toBe("Evidence must remain linked to its source.")
    await page.getByRole("button", { name: "저장", exact: true }).click()
    await expect(editor).toBeVisible()
    await expect(page.getByText("저장됨 · 자동 저장 안 함", { exact: true })).toBeVisible()
    const relations = page.getByRole("region", { name: "연결 및 백링크", exact: true })
    await expect(relations).toBeVisible()
    await relations.getByRole("button", { name: "검증 방법", exact: true }).click()
    await expect(page.getByRole("heading", { name: "검증 방법", exact: true })).toBeVisible()
    await page
      .getByRole("button", {
        name: "노트 구절 · Evidence must remain linked to its source.",
        exact: true,
      })
      .click()
    const context = page.getByLabel("연결된 구절 문맥")
    await expect(context.locator("mark")).toHaveText(anchor.quote)
    const source = page.getByRole("textbox", { name: "연결된 구절의 현재 마크다운 원문" })
    await expect(source).not.toBeVisible()
    await expect(page.getByText("현재 본문에서 연결 위치를 확인했습니다.")).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath("fragment-source.png") })
    await page.getByText("마크다운 원문 및 위치", { exact: true }).click()
    await expect(source).toBeVisible()
    await expect(page.getByText("현재 원문에서 연결된 구절을 선택했습니다.")).toBeVisible()
    expect(
      await source.evaluate((element) => {
        if (!(element instanceof HTMLTextAreaElement)) throw new Error("Expected source textarea")
        return {
          from: element.selectionStart,
          to: element.selectionEnd,
          quote: element.value.slice(element.selectionStart, element.selectionEnd),
        }
      }),
    ).toEqual({ from: anchor.from, to: anchor.to, quote: anchor.quote })
  } finally {
    await qa.close()
  }
})
