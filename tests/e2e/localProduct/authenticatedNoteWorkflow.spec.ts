import { Buffer } from "node:buffer"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../../support/electron/launchSimulatedAuthenticatedApplication"

const transparentPng = Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
)

test("simulated auth saves a note and returns to its image and history surfaces", async () => {
  const qa = await launchSimulatedAuthenticatedApplication()
  try {
    expect(qa.authMode).toBe("simulated-auth-not-live-google")
    const page = await qa.application.firstWindow()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()

    const asset = await page.evaluate(async (bytes) => {
      const collection = window.ohmypaper.collection
      if (!collection) throw new Error("Collection preload is unavailable")
      return collection.importAsset({
        kind: "bytes",
        bytes: Uint8Array.from(bytes),
        name: "qa-proof.png",
      })
    }, transparentPng)
    if (!asset) throw new Error("Synthetic PNG import did not return an asset")
    expect(asset.relativePath).toMatch(/^assets\/[a-f0-9]{64}\.png$/u)

    await page.getByRole("button", { name: "지식", exact: true }).click()
    await page.getByRole("combobox", { name: "지식 종류 필터" }).selectOption("note")
    await page.getByRole("button", { name: "생성", exact: true }).click()
    await expect(page.getByRole("button", { name: "지식 삭제", exact: true })).toBeVisible()
    const title = page.getByRole("textbox", { name: "제목 수정" })
    const body = page.getByRole("textbox", { name: "본문 내용 수정" })
    const source = `# 인증된 컬렉션 QA\n\n![로컬 증거](${asset.relativePath})`
    await title.fill("인증 컬렉션 노트")
    await body.fill(source)
    await page.getByText("삽입 도구", { exact: true }).click()
    await expect(page.getByRole("button", { name: "이미지", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "저장", exact: true }).click()
    await expect(body).toBeVisible()
    await expect(page.getByText("저장됨 · 자동 저장 안 함", { exact: true })).toBeVisible()

    await expect
      .poll(
        async () => {
          const matches = await page.evaluate(async () =>
            window.ohmypaper.knowledge.findNodes({ search: "인증 컬렉션 노트" }),
          )
          return matches.find((node) => node.title === "인증 컬렉션 노트")?.body ?? null
        },
        { timeout: 15_000 },
      )
      .toBe(source)

    await page.getByRole("button", { name: "라이브러리", exact: true }).click()
    await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
    await page.getByRole("button", { name: "지식", exact: true }).click()
    await page.getByRole("button", { name: "노트 인증 컬렉션 노트", exact: true }).click()
    await expect(page.locator(".note-live-heading")).toHaveText("인증된 컬렉션 QA")
    const reopenedBody = page.getByRole("textbox", { name: "본문 내용 수정" })
    await reopenedBody.click()
    await reopenedBody.press("Meta+Home")
    await page.locator(".cm-scroller").evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const image = page.getByRole("img", { name: "로컬 증거" })
    await expect(image).toBeVisible()
    await expect(image).toHaveAttribute(
      "src",
      /^scourgify-asset:\/\/local\/assets\/[a-f0-9]{64}\.png$/u,
    )
    await expect
      .poll(() =>
        image.evaluate((element) => {
          if (!(element instanceof HTMLImageElement)) throw new Error("Expected note image")
          return element.complete && element.naturalWidth > 0
        }),
      )
      .toBe(true)

    await page.getByRole("button", { name: "변경 이력", exact: true }).click()
    await expect(page.getByRole("heading", { name: "변경 이력", exact: true })).toBeVisible()
  } finally {
    await qa.close()
  }
})
