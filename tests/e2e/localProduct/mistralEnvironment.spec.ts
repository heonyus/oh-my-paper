import { randomUUID } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _electron as electron, expect, test } from "@playwright/test"
import dotenv from "dotenv"
import { collectionRootForId } from "../../../src/electron/collectionPaths"
import { activeCollectionPointerSchema } from "../../../src/shared/collectionSchemas"

test("installed Mistral uses a private env file and keeps import local", async () => {
  const { SCOURGIFY_LIVE_MISTRAL_QA: enabled, SCOURGIFY_E2E_EXECUTABLE: executable } = process.env
  test.skip(enabled !== "1", "requires explicit live Mistral QA")
  test.setTimeout(180_000)
  const source = dotenv.parse(await readFile(join(process.cwd(), ".env")))
  const { MISTRAL_API_KEY: key } = source
  if (!key) throw new Error("Live Mistral QA requires the user-provided env key")
  const profile = await mkdtemp(join(tmpdir(), "scourgify-mistral-env-"))
  const output = join(
    process.cwd(),
    ".omo/evidence/scourgify-local-product/2026-09-10-mistral-rollback",
  )
  await mkdir(output, { recursive: true })
  await writeFile(join(profile, ".env"), `MISTRAL_API_KEY=${key}\n`, { mode: 0o600 })
  await writeFile(
    join(profile, "local-access.json"),
    JSON.stringify({ version: 1, mode: "local", accountId: randomUUID() }),
    { mode: 0o600 },
  )
  const environment: Record<string, string> = {
    DOTENV_CONFIG_PATH: join(profile, ".env"),
    SCOURGIFY_USER_DATA_DIR: profile,
    SCOURGIFY_ACCOUNT_SERVICE_ORIGIN: "",
    SCOURGIFY_ACCOUNT_ISSUER: "",
    SCOURGIFY_GOOGLE_CLIENT_ID: "",
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && name !== "MISTRAL_API_KEY" && !(name in environment)) {
      environment[name] = value
    }
  }
  const application = await electron.launch({
    ...(executable ? { executablePath: executable, args: [] } : { args: ["."] }),
    env: environment,
  })
  try {
    const page = await application.firstWindow()
    const browserWindow = await application.browserWindow(page)
    await browserWindow.evaluate((window) => window.setContentSize(1440, 960))
    await expect(page.getByText("이 Mac · 로컬", { exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.scourgify.documentOcrStatus())).toMatchObject({
      configured: true,
      provider: "mistral",
    })
    await page.getByRole("button", { name: "설정", exact: true }).click()
    await expect(page.getByLabel("Mistral OCR API 키")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "OCR 키 저장" })).toHaveCount(0)
    await page.getByRole("button", { name: "설정 닫기", exact: true }).click()
    const imported = await page.evaluate(
      (path) => window.scourgify.importDocumentPath(path),
      join(process.cwd(), "tests/fixtures/document-ast/structured-document.pdf"),
    )
    if (!imported) throw new Error("Synthetic import failed")
    const activeCollection = activeCollectionPointerSchema.parse(
      JSON.parse(await readFile(join(profile, "active-collection.json"), "utf8")),
    )
    const cache = join(
      collectionRootForId(profile, activeCollection.collectionId),
      "parsed-pages",
      imported.document.hash,
      "mistral-ocr-4-1-blocks-v2",
      "page-2.json",
    )
    await expect(access(cache)).rejects.toMatchObject({ code: "ENOENT" })
    const parsed = await page.evaluate(
      (id) => window.scourgify.parseDocumentPage({ id, pageNumber: 2, forceOcr: true }),
      imported.document.id,
    )
    expect(parsed.status).toBe("ready")
    if (parsed.status !== "ready") throw new Error(`Mistral parse failed: ${parsed.reason}`)
    expect(parsed.page.parser).toBe("Mistral-OCR-4.1")
    expect(parsed.page.blocks.some((block) => block.label === "table")).toBe(true)
    expect(parsed.page.blocks.some((block) => block.label === "equation")).toBe(true)
    expect(
      parsed.page.blocks.every((block) => block.bounds.width > 0 && block.bounds.height > 0),
    ).toBe(true)
    await access(cache)
    await page.reload()
    await page.getByRole("button", { name: `${imported.document.title} 열기`, exact: true }).click()
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] canvas')).toBeVisible()
    await page.screenshot({ path: join(output, "installed-synthetic-reader.png"), scale: "css" })
    await writeFile(
      join(output, "installed-mistral-result.json"),
      JSON.stringify(
        {
          packagedApplication: Boolean(executable),
          realNetworkRequest: true,
          envFileLoaded: true,
          importDidNotRunMistral: true,
          keyFormAbsent: true,
          syntheticReaderVisible: true,
          parser: parsed.page.parser,
          labels: parsed.page.blocks.map((block) => block.label),
          blocksHaveGeometry: true,
          textTranslationTested: false,
        },
        null,
        2,
      ),
    )
  } finally {
    await application.close()
    await rm(profile, { recursive: true, force: true })
  }
})
