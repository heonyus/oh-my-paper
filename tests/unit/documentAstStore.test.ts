import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  astSidecarPath,
  createAstFingerprint,
  DocumentAstStore,
} from "../../src/electron/documentAstStore"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"

const roots: string[] = []
const sourceHash = "a".repeat(64)
const fingerprint = createAstFingerprint({
  sourceHash,
  extractorVersion: "pdfjs-6-source-1",
  configVersion: "source-only-v1",
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function ast() {
  return buildSourceDocumentAst(sourceHash, [
    {
      page: 1,
      width: 600,
      height: 800,
      items: [],
    },
  ])
}

describe("DocumentAstStore", () => {
  it("writes and reads a content-addressed sidecar without workspace embedding", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-ast-store-"))
    roots.push(root)
    const store = new DocumentAstStore(root)

    await store.write(ast(), fingerprint)

    expect(await store.read(sourceHash, fingerprint)).toEqual(ast())
    expect(await readFile(astSidecarPath(root, sourceHash, fingerprint), "utf8")).toContain(
      fingerprint,
    )
  })

  it("ignores stale, malformed, and interrupted artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-ast-invalid-"))
    roots.push(root)
    const store = new DocumentAstStore(root)
    const path = astSidecarPath(root, sourceHash, fingerprint)
    await mkdir(join(root, "document-ast", sourceHash), { recursive: true })
    await writeFile(path, "{not-json", "utf8")
    await writeFile(`${path}.interrupted.tmp`, JSON.stringify({ source: ast() }), "utf8")

    expect(await store.read(sourceHash, fingerprint)).toBeNull()
    expect(await store.read(sourceHash, "b".repeat(64))).toBeNull()
  })

  it("keeps the previous sidecar when rename is interrupted", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-ast-interrupted-"))
    roots.push(root)
    const stable = new DocumentAstStore(root)
    await stable.write(ast(), fingerprint)
    const interrupted = new DocumentAstStore(root, {
      beforeRename: async () => {
        throw new Error("simulated interruption")
      },
    })

    await expect(interrupted.write(ast(), fingerprint)).rejects.toMatchObject({
      name: "DocumentAstStoreError",
      kind: "write_failed",
    })
    expect(await stable.read(sourceHash, fingerprint)).toEqual(ast())
  })
})
