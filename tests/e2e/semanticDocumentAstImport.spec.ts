import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { _electron as electron, expect, test } from "@playwright/test"
import { z } from "zod"
import { createAstFingerprint } from "../../src/electron/documentAstStore"
import { semanticDocumentAstSchema } from "../../src/renderer/lib/semanticDocumentAst"

const semanticSidecarSchema = z.object({ semantic: semanticDocumentAstSchema })

test("PDF import composes a semantic sidecar after local preparation", async () => {
  // Given
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-semantic-e2e-"))
  const userData = join(temporaryRoot, "user-data")
  const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
  const fixtureBytes = await readFile(fixture)
  const sourceHash = createHash("sha256").update(fixtureBytes).digest("hex")
  const fingerprint = createAstFingerprint({
    sourceHash,
    extractorVersion: "pdfjs-6-source-1",
    configVersion: "source-only-v1",
  })
  const application = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      OH_MY_PAPER_LAYOUT_PYTHON: join(homedir(), ".ohmypaper", "layout-runtime", "bin", "python"),
      OH_MY_PAPER_USER_DATA_DIR: userData,
    },
  })

  // When
  let imported: Awaited<ReturnType<typeof window.ohmypaper.importDocumentPath>>
  try {
    const page = await application.firstWindow()
    imported = await page.evaluate(
      async (sourcePath) => window.ohmypaper.importDocumentPath(sourcePath),
      fixture,
    )
  } finally {
    await application.close()
  }

  // Then
  expect(imported).not.toBeNull()
  const sidecarDirectory = join(userData, "ohmypaper", "document-ast", sourceHash)
  const files = await readdir(sidecarDirectory)
  expect(files).toContain(`${fingerprint}.json`)
  const semanticFile = files.find((file) => file.endsWith(".semantic.json"))
  expect(semanticFile).toBeDefined()
  if (!semanticFile) return
  const semantic = semanticSidecarSchema.parse(
    JSON.parse(await readFile(join(sidecarDirectory, semanticFile), "utf8")),
  )
  expect(semantic.semantic.sourceHash).toBe(sourceHash)
  expect(["ready", "degraded"]).toContain(semantic.semantic.status)
  expect(
    createHash("sha256")
      .update(await readFile(join(userData, "ohmypaper", "documents", `${sourceHash}.pdf`)))
      .digest("hex"),
  ).toBe(sourceHash)
  await rm(temporaryRoot, { recursive: true, force: true })
})
