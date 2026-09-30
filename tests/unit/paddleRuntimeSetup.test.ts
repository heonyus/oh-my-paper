// @vitest-environment node

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const appleSilicon = process.platform === "darwin" && process.arch === "arm64"

// Stands in for uv: `venv` creates a python that succeeds, every other call records when it
// started and finished and takes a moment, so overlapping calls show up in the log.
const fakeUv = `#!/bin/sh
log="$FAKE_UV_LOG"
if [ "$1" = "venv" ]; then
  mkdir -p "$4/bin"
  printf '#!/bin/sh\\nexit 0\\n' > "$4/bin/python"
  chmod +x "$4/bin/python"
  exit 0
fi
echo "start $*" >> "$log"
[ -f "$FAKE_PROGRESS" ] && echo "progress $(cat "$FAKE_PROGRESS")" >> "$log"
sleep 0.4
echo "end $*" >> "$log"
`

const MODEL_REPO = "PaddlePaddle/PaddleOCR-VL-1.6"
const MODEL_FILES: Record<string, Buffer> = {
  "config.json": Buffer.from('{"model_type":"paddleocr_vl"}'),
  "model.safetensors": Buffer.alloc(4096, 7),
}

/** Plays both model hosts for the setup, logging each file request into the stand-in uv's log. */
async function fakeModelHosts(log: string): Promise<{ base: string; server: Server }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local")
    if (url.pathname === `/hf/api/models/${MODEL_REPO}`) {
      const siblings = Object.entries(MODEL_FILES).map(([path, data]) => ({
        rfilename: path,
        size: data.length,
        lfs: { sha256: createHash("sha256").update(data).digest("hex") },
      }))
      return void res.end(JSON.stringify({ siblings }))
    }
    const path = url.pathname.split(/\/resolve\/(?:main|master)\//)[1]
    const data = path ? MODEL_FILES[decodeURIComponent(path)] : undefined
    if (!data) return void res.writeHead(404).end()
    appendFileSync(log, `request ${url.pathname}\n`)
    const match = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? "")
    const body = match ? data.subarray(Number(match[1]), Number(match[2]) + 1) : data
    res.writeHead(match ? 206 : 200, { "content-length": body.length })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("no address")
  return { base: `http://127.0.0.1:${address.port}`, server }
}

function runSetup(env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/setup-paddle-vl-runtime.mjs"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    child.on("close", (code) => resolve({ code, output }))
  })
}

describe("PaddleOCR-VL runtime setup", () => {
  it("pins the full parser runtime and writes the readiness marker", async () => {
    const setup = await readFile("scripts/setup-paddle-vl-runtime.mjs", "utf8")

    expect(setup).toContain('"paddlepaddle==3.2.1"')
    expect(setup).toContain('"paddleocr[doc-parser]==3.7.0"')
    expect(setup).toContain('".ready-v1.6-layout-v2"')
    expect(setup).toContain('"PP-DocLayoutV3"')
    expect(setup).toContain('"mlx-vlm==0.6.17"')
    expect(setup).toContain('"jinja2==3.1.6"')
    expect(setup).toContain('".ready-mlx-v1.6"')
    expect(setup).toContain('"PaddlePaddle/PaddleOCR-VL-1.6"')
    expect(setup).toContain('from "./model-download.mjs"')
  })

  describe.skipIf(process.platform === "win32")("with a stand-in uv", () => {
    let root = ""
    let env: NodeJS.ProcessEnv = {}
    let hosts: Server | null = null

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "ohmypaper-paddle-setup-"))
      const bin = join(root, "bin")
      await mkdir(bin)
      await writeFile(join(bin, "uv"), fakeUv)
      await chmod(join(bin, "uv"), 0o755)
      const { PATH: inheritedPath = "" } = process.env
      const model = await fakeModelHosts(join(root, "uv.log"))
      hosts = model.server
      env = {
        ...process.env,
        PATH: `${bin}${delimiter}${inheritedPath}`,
        FAKE_UV_LOG: join(root, "uv.log"),
        FAKE_PROGRESS: join(root, "paddle-vl-install.progress.json"),
        HF_ENDPOINT: `${model.base}/hf`,
        MODELSCOPE_ENDPOINT: `${model.base}/ms`,
        OH_MY_PAPER_PADDLE_VL_RUNTIME: join(root, "paddle-vl-runtime"),
        OH_MY_PAPER_PADDLE_VL_MLX_RUNTIME: join(root, "paddle-vl-mlx-runtime"),
      }
    })

    afterEach(async () => {
      await new Promise<void>((resolve) => (hosts ? hosts.close(() => resolve()) : resolve()))
      await rm(root, { recursive: true, force: true })
    })

    it("installs, marks the runtime ready and releases its lock", async () => {
      const { code, output } = await runSetup(env)

      expect(code, output).toBe(0)
      await expect(
        readFile(join(root, "paddle-vl-runtime", ".ready-v1.6-layout-v2"), "utf8"),
      ).resolves.toContain("PaddleOCR-VL-1.6")
      await expect(readFile(join(root, "paddle-vl-install.pid"))).rejects.toThrow()
      await expect(readFile(join(root, "paddle-vl-install.progress.json"))).rejects.toThrow()
      const calls = await readFile(join(root, "uv.log"), "utf8")
      // Progress is on disk while the steps run and grows as they finish.
      const percents = [...calls.matchAll(/progress \{"percent":(\d+)/g)].map((match) =>
        Number(match[1]),
      )
      expect(percents.length).toBeGreaterThan(0)
      expect(Math.max(...percents)).toBeGreaterThan(0)
      expect(percents).toEqual([...percents].sort((a, b) => a - b))
      // CPU wheels come from PyPI rather than Paddle's own index.
      expect(calls).toContain("start pip install")
      expect(calls).not.toContain("paddlepaddle.org.cn")
    })

    it.runIf(appleSilicon)("downloads the model while the runtimes install", async () => {
      const { code, output } = await runSetup(env)
      expect(code, output).toBe(0)

      const calls = (await readFile(join(root, "uv.log"), "utf8")).trim().split("\n")
      const modelStart = calls.findIndex((line) => line.startsWith("request "))
      const paddleEnd = calls.findIndex(
        (line) => line.startsWith("end pip install") && line.includes("paddlepaddle==3.2.1"),
      )
      expect(modelStart).toBeGreaterThanOrEqual(0)
      expect(modelStart).toBeLessThan(paddleEnd)
      await expect(
        readFile(join(root, "paddle-vl-mlx-runtime", ".ready-mlx-v1.6"), "utf8"),
      ).resolves.toContain("MLX-VLM")
      await expect(
        readFile(join(root, "paddle-vl-mlx-runtime", "models", "PaddleOCR-VL-1.6", "config.json")),
      ).resolves.toEqual(MODEL_FILES["config.json"])
    })

    it("leaves a running install alone", async () => {
      await writeFile(join(root, "paddle-vl-install.pid"), `${process.pid}\n`)

      const { code, output } = await runSetup(env)

      expect(code).toBe(0)
      expect(output).toContain("이미 다른 설치가 진행 중입니다")
      await expect(readFile(join(root, "uv.log"))).rejects.toThrow()
      await expect(readFile(join(root, "paddle-vl-install.pid"), "utf8")).resolves.toBe(
        `${process.pid}\n`,
      )
    })

    it("reports a failed step and exits non-zero", async () => {
      await writeFile(join(root, "bin", "uv"), `${fakeUv.replace("sleep 0.4", "exit 7")}`)

      const { code, output } = await runSetup(env)

      expect(code).toBe(1)
      expect(output).toContain("설치 실패")
      await expect(
        readFile(join(root, "paddle-vl-runtime", ".ready-v1.6-layout-v2")),
      ).rejects.toThrow()
      await expect(readFile(join(root, "paddle-vl-install.pid"))).rejects.toThrow()
    })
  })
})
