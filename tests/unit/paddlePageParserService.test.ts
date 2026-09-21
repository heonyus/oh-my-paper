// @vitest-environment node

import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  PaddlePageParserService,
  paddlePageParserRuntimePython,
} from "../../src/electron/paddlePageParserService"
import type { PaddleVlmServer } from "../../src/electron/paddleVlmServer"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

describe("Paddle page parser service", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("resolves the managed runtime independently from other layout models", () => {
    expect(paddlePageParserRuntimePython("/Users/test", "darwin")).toBe(
      "/Users/test/.scourgify/paddle-vl-runtime/bin/python",
    )
  })

  it("parses one page offline and reuses the page cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "paddle-page-parser-test-"))
    const resourceRoot = join(root, "layout")
    const script = join(resourceRoot, "paddle_vl_page_parser.py")
    const marker = join(root, ".ready-v1.6")
    const sourceHash = "c".repeat(64)
    const documentId = documentIdSchema.parse(sourceHash.slice(0, 16))
    const store = new WorkspaceStore(root)
    await mkdir(resourceRoot, { recursive: true })
    await mkdir(store.documentsDirectory, { recursive: true })
    await writeFile(marker, "ready", "utf8")
    await writeFile(join(store.documentsDirectory, `${sourceHash}.pdf`), "%PDF-fixture", "utf8")
    await writeFile(
      script,
      [
        'const fs = require("node:fs")',
        'if (process.env.HF_HUB_OFFLINE !== "1" || process.env.TRANSFORMERS_OFFLINE !== "1") process.exit(4)',
        'if (process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK !== "True" || !process.env.PADDLE_PDX_CACHE_HOME) process.exit(5)',
        'if (["OPENAI_API_KEY", "OAUTH_ACCESS_TOKEN", "HTTPS_PROXY", "CODEX_AUTH_TOKEN"].some((key) => process.env[key] === "canary-secret")) process.exit(6)',
        'if (process.argv[6] !== "--vlm-server-url" || process.argv[7] !== "http://127.0.0.1:18111/" || process.argv[8] !== "--vlm-model" || process.argv[9] !== "/models/PaddleOCR-VL-1.6" || process.argv[10] !== "--vlm-api-key" || process.argv[11] !== "local-secret") process.exit(5)',
        "const page = Number(process.argv[4])",
        'fs.writeFileSync(process.argv[5], JSON.stringify({schemaVersion:"1.0.0",sourceHash:process.argv[3],parser:"PaddleOCR-VL-1.6",configVersion:"page-v2",pageNumber:page,width:1000,height:1000,blocks:[{id:"page:"+page+":block:0",label:"text",order:0,bounds:{x:50,y:80,width:400,height:100},content:"Parsed paragraph.",contentFormat:"markdown",translationPolicy:"include"}]}))',
      ].join("\n"),
      "utf8",
    )
    await chmod(script, 0o644)
    const document = documentRecordSchema.parse({
      id: documentId,
      name: "paper.pdf",
      hash: sourceHash,
      bytes: 12,
      importedAt: "2026-09-02T00:00:00.000Z",
      pageCount: 2,
      title: "Paper",
      authors: [],
      year: null,
      doi: null,
      kind: "research_paper",
      overview: "",
      quality: { textCharacters: 12, needsOcr: false, warnings: [] },
    })
    await store.save({ ...defaultWorkspace(), documents: [document] })
    const stop = vi.fn()
    const vlmServer: PaddleVlmServer = {
      start: async () => ({
        serverUrl: "http://127.0.0.1:18111/",
        model: "/models/PaddleOCR-VL-1.6",
        apiKey: "local-secret",
      }),
      stop,
    }
    const service = new PaddlePageParserService({
      appPath: root,
      resourcesPath: root,
      packaged: true,
      python: process.execPath,
      readinessMarker: marker,
      vlmServer,
    })
    const stages: string[] = []
    vi.stubEnv("OPENAI_API_KEY", "canary-secret")
    vi.stubEnv("OAUTH_ACCESS_TOKEN", "canary-secret")
    vi.stubEnv("HTTPS_PROXY", "canary-secret")
    vi.stubEnv("CODEX_AUTH_TOKEN", "canary-secret")

    try {
      await expect(service.status()).resolves.toEqual({
        configured: true,
        provider: "paddle",
        model: "PaddleOCR-VL-1.6",
      })
      const first = await service.parse({
        documentId,
        pageNumber: 1,
        store,
        onProgress: (progress) => stages.push(progress.stage),
      })
      await writeFile(script, "process.exit(9)", "utf8")
      const cached = await service.parse({ documentId, pageNumber: 1, store })

      expect(first.status === "unavailable" ? first.reason : "ready").toBe("ready")
      expect(first).toMatchObject({ status: "ready", page: { pageNumber: 1 } })
      expect(cached).toEqual(first)
      expect(stages).toEqual([
        "engine-starting",
        "page-rendering",
        "document-analyzing",
        "finalizing",
      ])
      service.dispose()
      expect(stop).toHaveBeenCalledOnce()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
