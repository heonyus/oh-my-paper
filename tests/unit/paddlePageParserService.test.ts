// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  PaddlePageParserService,
  paddlePageParserRuntimePython,
} from "../../src/electron/paddlePageParserService"
import type { PaddleVlmLaunch, PaddleVlmServer } from "../../src/electron/paddleVlmServer"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

// Stands in for paddle_vl_worker.py: records how it was started and which pages each
// request asked for, then writes a parsed page per request page.
const fakeWorker = `
const fs = require("node:fs")
const path = require("node:path")
const readline = require("node:readline")
const offline = process.env.HF_HUB_OFFLINE === "1" && process.env.TRANSFORMERS_OFFLINE === "1"
if (!offline || process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK !== "True") process.exit(4)
if (process.env.FLAGS_allocator_strategy !== "auto_growth") process.exit(5)
const leaked = ["OPENAI_API_KEY", "OAUTH_ACCESS_TOKEN", "HTTPS_PROXY", "CODEX_AUTH_TOKEN"]
if (leaked.some((key) => process.env[key] === "canary-secret")) process.exit(6)
const log = (name, line) => fs.appendFileSync(path.join(__dirname, name), line + "\\n")
log("starts.log", [...process.argv.slice(2), process.env.OH_MY_PAPER_VLM_API_KEY ?? "-"].join(" "))
console.log(JSON.stringify({ event: "ready" }))
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line)
  log("requests.log", request.pages.join(","))
  const failure = path.join(__dirname, "fail-next-request")
  if (fs.existsSync(failure)) {
    fs.rmSync(failure)
    console.log(JSON.stringify({ event: "failed", id: request.id, reason: "execution_failed" }))
    return
  }
  fs.mkdirSync(request.outputDir, { recursive: true })
  for (const page of request.pages) {
    fs.writeFileSync(path.join(request.outputDir, "page-" + page + ".json"), JSON.stringify({
      schemaVersion: "1.0.0", sourceHash: request.sourceHash, parser: "PaddleOCR-VL-1.6",
      configVersion: "page-v3", pageNumber: page, width: 1000, height: 1000,
      blocks: [{ id: "page:" + page + ":block:0", label: "text", order: 0,
        bounds: { x: 50, y: 80, width: 400, height: 100 }, content: "Parsed paragraph.",
        contentFormat: "markdown", translationPolicy: "include" }],
    }))
    console.log(JSON.stringify({ event: "page", id: request.id, pageNumber: page }))
  }
  console.log(JSON.stringify({ event: "done", id: request.id }))
})
`

const vllmConnection = {
  backend: "vllm-server",
  serverUrl: "http://127.0.0.1:18111/v1",
  model: "PaddleOCR-VL-1.6-0.9B",
  apiKey: "local-secret",
} as const

async function fixture(pageCount: number) {
  const root = await mkdtemp(join(tmpdir(), "paddle-page-parser-test-"))
  const layout = join(root, "layout")
  const marker = join(root, ".ready-v1.6")
  const sourceHash = "c".repeat(64)
  const documentId = documentIdSchema.parse(sourceHash.slice(0, 16))
  const store = new WorkspaceStore(root)
  await mkdir(layout, { recursive: true })
  await mkdir(store.documentsDirectory, { recursive: true })
  await writeFile(marker, "ready", "utf8")
  await writeFile(join(layout, "paddle_vl_worker.py"), fakeWorker, "utf8")
  await writeFile(join(store.documentsDirectory, `${sourceHash}.pdf`), "%PDF-fixture", "utf8")
  const document = documentRecordSchema.parse({
    id: documentId,
    name: "paper.pdf",
    hash: sourceHash,
    bytes: 12,
    importedAt: "2026-09-02T00:00:00.000Z",
    pageCount,
    title: "Paper",
    authors: [],
    year: null,
    doi: null,
    kind: "research_paper",
    overview: "",
    quality: { textCharacters: 12, needsOcr: false, warnings: [] },
  })
  await store.save({ ...defaultWorkspace(), documents: [document] })
  const log = async (name: string): Promise<string[]> =>
    (await readFile(join(layout, name), "utf8")).trim().split("\n")
  const cleanup = async (): Promise<void> => {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
  return { root, layout, marker, documentId, store, log, cleanup }
}

function fakeVlmServer(startError?: Error): PaddleVlmServer & { stop: () => void } {
  return {
    acceleration: async () => "vllm",
    launch: async (): Promise<PaddleVlmLaunch> => {
      const ready = startError ? Promise.reject(startError) : Promise.resolve()
      // Like the real servers: callers await `ready`, so an early failure is not unhandled.
      ready.catch(() => undefined)
      return { connection: vllmConnection, ready }
    },
    stop: vi.fn(),
  }
}

describe("Paddle page parser service", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("resolves the managed runtime independently from other layout models", () => {
    expect(paddlePageParserRuntimePython("/Users/test", "darwin")).toBe(
      join("/Users/test", ".ohmypaper", "paddle-vl-runtime", "bin", "python"),
    )
  })

  it("parses the whole document through one offline worker and reuses the page cache", async () => {
    const { root, layout, marker, documentId, store, log, cleanup } = await fixture(10)
    const vlmServer = fakeVlmServer()
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
        acceleration: "vllm",
      })
      const first = await service.parse({
        documentId,
        pageNumber: 1,
        store,
        onProgress: (progress) => stages.push(progress.stage),
      })
      expect(first).toMatchObject({ status: "ready", page: { pageNumber: 1 } })
      expect(stages).toEqual(["engine-starting", "document-analyzing"])

      const tenth = await service.parse({ documentId, pageNumber: 10, store })
      await writeFile(join(layout, "paddle_vl_worker.py"), "process.exit(9)", "utf8")
      const cached = await service.parse({ documentId, pageNumber: 1, store })

      expect(tenth).toMatchObject({ status: "ready", page: { pageNumber: 10 } })
      expect(cached).toEqual(first)
      expect(await log("starts.log")).toEqual([
        "--vlm-backend vllm-server --vlm-server-url http://127.0.0.1:18111/v1 --vlm-model PaddleOCR-VL-1.6-0.9B local-secret",
      ])
      const requests = await log("requests.log")
      expect(requests[0]).toBe("1,2,3,4,5,6,7,8")
      // Page 10 is asked for while the worker may already be taking the rest, so the
      // order depends on timing; what matters is that every page is parsed exactly once.
      const remaining = requests.slice(1).flatMap((line) => line.split(",").map(Number))
      expect(remaining.sort((left, right) => left - right)).toEqual([9, 10])
      service.dispose()
      expect(vlmServer.stop).toHaveBeenCalledOnce()
    } finally {
      service.dispose()
      await cleanup()
    }
  })

  it("falls back to in-process recognition when the GPU server does not start", async () => {
    const { root, marker, documentId, store, log, cleanup } = await fixture(2)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const vlmServer = fakeVlmServer(new Error("vLLM did not start"))
    const service = new PaddlePageParserService({
      appPath: root,
      resourcesPath: root,
      packaged: true,
      python: process.execPath,
      readinessMarker: marker,
      vlmServer,
    })

    try {
      await expect(service.parse({ documentId, pageNumber: 2, store })).resolves.toMatchObject({
        status: "ready",
        page: { pageNumber: 2 },
      })
      expect(vlmServer.stop).toHaveBeenCalled()
      expect((await log("starts.log")).at(-1)).toBe("-")
      await expect(service.status()).resolves.toMatchObject({ acceleration: null })
    } finally {
      service.dispose()
      await cleanup()
    }
  })

  it("restarts the worker and the GPU server after a recognition failure", async () => {
    const { root, layout, marker, documentId, store, log, cleanup } = await fixture(1)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    await writeFile(join(layout, "fail-next-request"), "", "utf8")
    const vlmServer = fakeVlmServer()
    const service = new PaddlePageParserService({
      appPath: root,
      resourcesPath: root,
      packaged: true,
      python: process.execPath,
      readinessMarker: marker,
      vlmServer,
    })

    try {
      await expect(service.parse({ documentId, pageNumber: 1, store })).resolves.toEqual({
        status: "unavailable",
        reason: "execution_failed",
      })
      expect(vlmServer.stop).toHaveBeenCalledOnce()
      await expect(service.parse({ documentId, pageNumber: 1, store })).resolves.toMatchObject({
        status: "ready",
      })
      expect(await log("starts.log")).toHaveLength(2)
    } finally {
      service.dispose()
      await cleanup()
    }
  })

  it("fails every waiting page after one unsuccessful engine start", async () => {
    const { root, layout, marker, documentId, store, log, cleanup } = await fixture(20)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    await writeFile(
      join(layout, "paddle_vl_worker.py"),
      'require("node:fs").appendFileSync(require("node:path").join(__dirname, "starts.log"), "start\\n"); process.exit(3)',
      "utf8",
    )
    const service = new PaddlePageParserService({
      appPath: root,
      resourcesPath: root,
      packaged: true,
      python: process.execPath,
      readinessMarker: marker,
      vlmServer: fakeVlmServer(),
    })

    try {
      const unavailable = { status: "unavailable", reason: "model_unavailable" }
      await expect(
        Promise.all([
          service.parse({ documentId, pageNumber: 1, store }),
          service.parse({ documentId, pageNumber: 12, store }),
        ]),
      ).resolves.toEqual([unavailable, unavailable])
      expect(await log("starts.log")).toEqual(["start"])
    } finally {
      service.dispose()
      await cleanup()
    }
  })

  it("reports a missing runtime without starting anything", async () => {
    const { root, documentId, store, cleanup } = await fixture(1)
    const vlmServer = fakeVlmServer()
    const launch = vi.spyOn(vlmServer, "launch")
    const service = new PaddlePageParserService({
      appPath: root,
      resourcesPath: root,
      packaged: true,
      python: process.execPath,
      readinessMarker: join(root, "missing-marker"),
      vlmServer,
    })

    try {
      await expect(service.parse({ documentId, pageNumber: 1, store })).resolves.toEqual({
        status: "unavailable",
        reason: "runtime_missing",
      })
      expect(launch).not.toHaveBeenCalled()
    } finally {
      service.dispose()
      await cleanup()
    }
  })
})
