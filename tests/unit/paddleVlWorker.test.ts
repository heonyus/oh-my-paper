// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PaddleVlWorker, paddleVlWorkerArguments } from "../../src/electron/paddleVlWorker"

const request = {
  pdfPath: "paper.pdf",
  sourceHash: "c".repeat(64),
  pages: [1, 2],
  outputDir: "pages",
}

describe("PaddleOCR-VL worker", () => {
  let root = ""

  afterEach(async () => {
    vi.restoreAllMocks()
    if (root) await rm(root, { recursive: true, force: true })
    root = ""
  })

  async function workerScript(body: string): Promise<string> {
    root = await mkdtemp(join(tmpdir(), "paddle-vl-worker-test-"))
    const script = join(root, "worker.js")
    await writeFile(
      script,
      [
        'const readline = require("node:readline")',
        "const send = (message) => console.log(JSON.stringify(message))",
        'send({ event: "ready" })',
        'readline.createInterface({ input: process.stdin }).on("line", (line) => {',
        "  const request = JSON.parse(line)",
        body,
        "})",
      ].join("\n"),
      "utf8",
    )
    return script
  }

  it("passes the GPU server to the worker only when one is running", () => {
    expect(paddleVlWorkerArguments("worker.py", null)).toEqual(["worker.py"])
    expect(
      paddleVlWorkerArguments("worker.py", {
        backend: "mlx-vlm-server",
        serverUrl: "http://127.0.0.1:1234/",
        model: "/models/PaddleOCR-VL-1.6",
        apiKey: "secret",
      }),
    ).toEqual([
      "worker.py",
      "--vlm-backend",
      "mlx-vlm-server",
      "--vlm-server-url",
      "http://127.0.0.1:1234/",
      "--vlm-model",
      "/models/PaddleOCR-VL-1.6",
    ])
  })

  it("rejects a request the worker reports as failed and keeps serving", async () => {
    const script = await workerScript(
      [
        '  if (request.pages[0] === 1) send({ event: "failed", id: request.id, reason: "invalid_page" })',
        "  else {",
        '    send({ event: "page", id: request.id, pageNumber: 3 })',
        '    send({ event: "done", id: request.id })',
        "  }",
      ].join("\n"),
    )
    const worker = await PaddleVlWorker.start({
      python: process.execPath,
      script,
      env: process.env,
      vlm: null,
    })

    await expect(worker.parse(request, vi.fn())).rejects.toMatchObject({
      reason: "failed",
      message: "PaddleOCR-VL worker failed: invalid_page",
    })
    const pages: number[] = []
    await worker.parse({ ...request, pages: [3] }, (page) => pages.push(page))
    expect(pages).toEqual([3])
    worker.stop()
  })

  it("rejects the running request when the worker exits", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const script = await workerScript('  console.error("out of memory"); process.exit(3)')
    const worker = await PaddleVlWorker.start({
      python: process.execPath,
      script,
      env: process.env,
      vlm: null,
    })

    await expect(worker.parse(request, vi.fn())).rejects.toMatchObject({ reason: "exited" })
    expect(worker.alive).toBe(false)
  })
})
