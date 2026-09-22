import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron as electron, expect, test } from "@playwright/test"

test("explicit local owner opens production workspace and preserves papers and notes after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-local-owner-"))
  const profile = join(root, "profile")
  const accountId = randomUUID()
  await mkdir(profile)
  await writeFile(
    join(profile, "local-access.json"),
    JSON.stringify({
      version: 1,
      mode: "local",
      accountId,
    }),
    { mode: 0o600 },
  )
  const output = join(process.cwd(), ".omo/evidence/ohmypaper-local-product/2026-09-08-local-owner")
  await mkdir(output, { recursive: true })
  const { OH_MY_PAPER_LOCAL_OWNER_EXECUTABLE: executable } = process.env
  let paperHash = ""
  try {
    for (const reopening of [false, true]) {
      const app = await electron.launch({
        ...(executable ? { executablePath: executable } : {}),
        args: executable ? [] : ["."],
        env: {
          ...process.env,
          OH_MY_PAPER_USER_DATA_DIR: profile,
          OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN: "",
          OH_MY_PAPER_ACCOUNT_ISSUER: "",
          OH_MY_PAPER_GOOGLE_CLIENT_ID: "",
        },
      })
      try {
        const page = await app.firstWindow()
        const browserWindow = await app.browserWindow(page)
        await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
        await expect(page.getByRole("region", { name: "PDF 라이브러리" })).toBeVisible()
        await expect(page.getByText("이 Mac · 로컬", { exact: true })).toBeVisible()
        await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toHaveCount(0)
        expect(await page.evaluate(() => window.ohmypaper.account?.status())).toEqual({
          state: "local",
          accountId,
        })
        if (!reopening) {
          const imported = await page.evaluate(
            (path) => window.ohmypaper.importDocumentPath(path),
            join(process.cwd(), "tests/fixtures/sample-paper.pdf"),
          )
          if (!imported) throw new Error("Synthetic local PDF import failed")
          paperHash = imported.document.hash
          await page.reload()
        }
        await page.screenshot({
          path: join(output, reopening ? "reopened-library.png" : "library.png"),
        })
        await page.getByRole("button", { name: "리더", exact: true }).click()
        await expect(page.locator(".board-viewport")).toHaveAttribute(
          "data-document-hash",
          paperHash,
        )
        await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible()
        await page.screenshot({ path: join(output, "reader.png") })
        await page.getByRole("button", { name: "지식", exact: true }).click()
        if (!reopening) {
          await page.getByRole("combobox", { name: "지식 종류 필터" }).selectOption("note")
          await page.getByRole("button", { name: "생성", exact: true }).click()
          await page.getByRole("textbox", { name: "제목 수정" }).fill("로컬 사용 저장 확인")
          await page
            .getByRole("textbox", { name: "본문 내용 수정" })
            .fill("# 로컬 근거\n\n로그인 없이 저장한 합성 QA 노트입니다.")
          await page.getByRole("button", { name: "저장", exact: true }).click()
          await expect(page.getByText("저장됨 · 자동 저장 안 함", { exact: true })).toBeVisible()
        } else {
          await page.getByRole("button", { name: "노트 로컬 사용 저장 확인", exact: true }).click()
          await expect(page.getByRole("textbox", { name: "제목 수정" })).toHaveValue(
            "로컬 사용 저장 확인",
          )
        }
        await expect
          .poll(() =>
            page.evaluate(async () => {
              const notes = await window.ohmypaper.knowledge.findNodes({
                search: "로컬 사용 저장 확인",
              })
              return notes.find((note) => note.title === "로컬 사용 저장 확인")?.body
            }),
          )
          .toBe("# 로컬 근거\n\n로그인 없이 저장한 합성 QA 노트입니다.")
        if (reopening) {
          await page.getByRole("button", { name: "소스 보기", exact: true }).click()
          expect((await page.locator(".cm-content .cm-line").allTextContents()).join("\n")).toBe(
            "# 로컬 근거\n\n로그인 없이 저장한 합성 QA 노트입니다.",
          )
          await page.getByRole("button", { name: "라이브", exact: true }).click()
        }
        await page.screenshot({ path: join(output, "note.png") })
        await page.getByRole("button", { name: "설정", exact: true }).click()
        await expect(page.getByRole("button", { name: "일반", exact: true })).toBeVisible()
        await page.getByRole("button", { name: "설정 닫기", exact: true }).click()
      } finally {
        await app.close()
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
