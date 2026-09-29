import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DocumentLayoutService,
  layoutRuntimePython,
  layoutScriptPath,
} from "../../src/electron/documentLayoutService"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

describe("document layout service paths", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("resolves the managed macOS runtime", () => {
    expect(layoutRuntimePython("/Users/test", "darwin")).toBe(
      join("/Users/test", ".ohmypaper", "layout-runtime", "bin", "python"),
    )
  })

  it("resolves the managed Windows runtime", () => {
    expect(layoutRuntimePython("C:\\Users\\test", "win32")).toBe(
      join("C:\\Users\\test", ".ohmypaper", "layout-runtime", "Scripts", "python.exe"),
    )
  })

  it("honors an explicit runtime and packaged script path", () => {
    expect(layoutRuntimePython("/home/test", "linux", "/custom/python")).toBe("/custom/python")
    expect(layoutScriptPath("/repo", "/Applications/App/Resources", true)).toBe(
      join("/Applications/App/Resources", "layout", "pp_structure_layout.py"),
    )
  })

  it("reuses a valid cached local layout without starting another parser", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-layout-cache-"))
    const store = new WorkspaceStore(root)
    const sourceHash = "f".repeat(64)
    const documentId = documentIdSchema.parse(sourceHash.slice(0, 16))
    const document = documentRecordSchema.parse({
      id: documentId,
      name: "paper.pdf",
      hash: sourceHash,
      bytes: 12,
      importedAt: "2026-09-02T00:00:00.000Z",
      pageCount: 1,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
      overview: "",
      quality: { textCharacters: 12, needsOcr: false, warnings: [] },
    })
    await store.save({ ...defaultWorkspace(), documents: [document] })
    await mkdir(join(root, "layout"), { recursive: true })
    await writeFile(
      join(root, "layout", `${documentId}.json`),
      JSON.stringify({
        version: 2,
        model: "PP-DocLayout_plus-L",
        sourceHash,
        pages: [],
      }),
      "utf8",
    )
    const service = new DocumentLayoutService({
      appPath: root,
      resourcesPath: root,
      packaged: false,
      python: join(root, "missing-python"),
    })

    try {
      const first = await service.analyze(documentId, store)
      const second = await service.analyze(documentId, store)

      expect(first).toMatchObject({
        status: "ready",
        layout: { version: 2, model: "PP-DocLayout_plus-L" },
      })
      expect(second).toEqual(first)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("runs a layout parser without inheriting credential or proxy canaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "document-layout-env-test-"))
    const sourceHash = "b".repeat(64)
    const documentId = documentIdSchema.parse(sourceHash.slice(0, 16))
    const store = new WorkspaceStore(root)
    const script = join(root, "src", "layout", "pp_structure_layout.py")
    const document = documentRecordSchema.parse({
      id: documentId,
      name: "paper.pdf",
      hash: sourceHash,
      bytes: 12,
      importedAt: "2026-09-02T00:00:00.000Z",
      pageCount: 1,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
      overview: "",
      quality: { textCharacters: 12, needsOcr: false, warnings: [] },
    })
    await mkdir(join(root, "src", "layout"), { recursive: true })
    await mkdir(store.documentsDirectory, { recursive: true })
    await writeFile(join(store.documentsDirectory, `${sourceHash}.pdf`), "%PDF-fixture", "utf8")
    await writeFile(
      script,
      [
        'const fs = require("node:fs")',
        'if (process.env.HF_HUB_OFFLINE !== "1" || process.env.TRANSFORMERS_OFFLINE !== "1" || process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK !== "True" || !process.env.PADDLE_PDX_CACHE_HOME) process.exit(4)',
        'if (["OPENAI_API_KEY", "OAUTH_ACCESS_TOKEN", "HTTPS_PROXY", "CODEX_AUTH_TOKEN"].some((key) => process.env[key] === "canary-secret")) process.exit(5)',
        `fs.writeFileSync(process.argv[3], JSON.stringify({version:2,model:"PP-DocLayout_plus-L",sourceHash:"${sourceHash}",pages:[]}))`,
      ].join("\n"),
      "utf8",
    )
    await store.save({ ...defaultWorkspace(), documents: [document] })
    vi.stubEnv("OPENAI_API_KEY", "canary-secret")
    vi.stubEnv("OAUTH_ACCESS_TOKEN", "canary-secret")
    vi.stubEnv("HTTPS_PROXY", "canary-secret")
    vi.stubEnv("CODEX_AUTH_TOKEN", "canary-secret")

    try {
      const result = await new DocumentLayoutService({
        appPath: root,
        resourcesPath: root,
        packaged: false,
        home: root,
        python: process.execPath,
      }).analyze(documentId, store)

      expect(result).toMatchObject({ status: "ready", layout: { sourceHash, pages: [] } })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
