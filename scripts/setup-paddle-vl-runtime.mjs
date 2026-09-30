import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { downloadRepository, modelSources } from "./model-download.mjs"

const runtimeRoot =
  process.env.OH_MY_PAPER_PADDLE_VL_RUNTIME ?? join(homedir(), ".ohmypaper", "paddle-vl-runtime")
const scriptsDirectory = process.platform === "win32" ? "Scripts" : "bin"
const python = join(
  runtimeRoot,
  scriptsDirectory,
  process.platform === "win32" ? "python.exe" : "python",
)
const readinessMarker = join(runtimeRoot, ".ready-v1.6-layout-v2")
const layoutModel = "PP-DocLayoutV3"
const appleAcceleration = process.platform === "darwin" && process.arch === "arm64"
const mlxRuntimeRoot =
  process.env.OH_MY_PAPER_PADDLE_VL_MLX_RUNTIME ??
  join(homedir(), ".ohmypaper", "paddle-vl-mlx-runtime")
const mlxPython = join(mlxRuntimeRoot, "bin", "python")
const mlxModelRepository = "PaddlePaddle/PaddleOCR-VL-1.6"
const mlxModelDirectory = join(mlxRuntimeRoot, "models", "PaddleOCR-VL-1.6")
const mlxReadinessMarker = join(mlxRuntimeRoot, ".ready-mlx-v1.6")
// Beside the runtime folders, matching paddleInstallPaths() in src/electron/paddleInstallState.ts.
const installLock = join(dirname(runtimeRoot), "paddle-vl-install.pid")
const installProgress = join(dirname(runtimeRoot), "paddle-vl-install.progress.json")

const children = new Set()

/** Share of the install each part takes; on Apple silicon the model download is the long pole. */
const weights = appleAcceleration
  ? { paddle: 5, paddleocr: 10, layout: 5, mlx: 5, model: 65, pipeline: 10 }
  : { paddle: 15, paddleocr: 25, layout: 15, pipeline: 45 }
const finished = new Set()
const model = { total: 1_930_000_000, bytes: 0, samples: [] }
let installStarted = Date.now()

function progressPercent() {
  let sum = 0
  let total = 0
  for (const [key, weight] of Object.entries(weights)) {
    total += weight
    if (finished.has(key)) sum += weight
    else if (key === "model") sum += weight * Math.min(1, model.bytes / model.total)
  }
  // 100 means ready, which the readiness marker says, not this file.
  return Math.min(99, Math.floor((sum / total) * 100))
}

/** Seconds left: from the last 30 s of download rate while the model downloads, else elapsed time. */
function secondsLeft(percent) {
  if (appleAcceleration && !finished.has("model") && model.samples.length >= 2) {
    const first = model.samples[0]
    const last = model.samples.at(-1)
    const rate = (last.bytes - first.bytes) / ((last.at - first.at) / 1000)
    // The pipeline step still follows the download.
    if (rate > 0) return Math.round((model.total - model.bytes) / rate + 15)
  }
  const elapsed = (Date.now() - installStarted) / 1000
  if (percent < 3 || elapsed < 10) return null
  return Math.round((elapsed * (100 - percent)) / percent)
}

/** What doctor and 설정 read while the install runs; removed with the lock. */
function writeProgress() {
  if (appleAcceleration && !finished.has("model"))
    model.samples = [...model.samples, { at: Date.now(), bytes: model.bytes }].slice(-16)
  const percent = progressPercent()
  try {
    writeFileSync(
      installProgress,
      `${JSON.stringify({ percent, etaSeconds: secondsLeft(percent), updatedAt: new Date().toISOString() })}\n`,
    )
  } catch {
    // Progress is best effort; the install itself does not depend on it.
  }
}

function say(line) {
  process.stdout.write(`${line}\n`)
}

/** Runs one command, prefixing its output with the lane so parallel lanes stay readable. */
function run(lane, command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { TQDM_MININTERVAL: "10", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    children.add(child)
    for (const stream of [child.stdout, child.stderr]) {
      let pending = ""
      stream.setEncoding("utf8")
      stream.on("data", (chunk) => {
        const lines = (pending + chunk).split(/\r\n|\r|\n/)
        pending = lines.pop() ?? ""
        for (const line of lines) if (line.trim()) say(`[${lane}] ${line}`)
      })
      stream.on("end", () => {
        if (pending.trim()) say(`[${lane}] ${pending}`)
      })
    }
    child.on("error", (error) => {
      children.delete(child)
      reject(error)
    })
    child.on("close", (code, signal) => {
      children.delete(child)
      if (code === 0) resolve()
      else reject(new Error(`[${lane}] ${command} ${signal ?? `exited ${code}`}`))
    })
  })
}

async function step(lane, title, command, args, { env, key } = {}) {
  const started = Date.now()
  say(`[${lane}] ▶ ${title}`)
  await run(lane, command, args, env)
  say(`[${lane}] ✔ ${title} (${Math.round((Date.now() - started) / 1000)}초)`)
  if (key) finished.add(key)
  writeProgress()
}

function stopChildren() {
  for (const child of children) child.kill("SIGTERM")
}

function lockHolderAlive() {
  let pid
  try {
    pid = Number.parseInt(readFileSync(installLock, "utf8").trim(), 10)
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "EPERM"
  }
}

/** One install at a time: the wizard's background start and `npm run setup:paddle-vl` share it. */
function takeLock() {
  mkdirSync(dirname(installLock), { recursive: true })
  if (lockHolderAlive()) {
    say(`이미 다른 설치가 진행 중입니다 (${installLock})`)
    process.exit(0)
  }
  rmSync(installLock, { force: true })
  try {
    writeFileSync(installLock, `${process.pid}\n`, { flag: "wx" })
  } catch {
    say(`이미 다른 설치가 진행 중입니다 (${installLock})`)
    process.exit(0)
  }
  process.on("exit", () => {
    try {
      if (readFileSync(installLock, "utf8").trim() === String(process.pid)) {
        rmSync(installProgress, { force: true })
        rmSync(installLock)
      }
    } catch {
      // Already gone.
    }
  })
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      stopChildren()
      process.exit(1)
    })
  }
}

const nvidiaGpu = (() => {
  if (appleAcceleration) return false
  const probe = spawnSync("nvidia-smi", [], { stdio: "ignore" })
  return !probe.error && probe.status === 0
})()
// The CPU wheels are on PyPI, whose CDN is much faster outside China than Paddle's own index.
const paddleSource = nvidiaGpu
  ? ["--index", "https://www.paddlepaddle.org.cn/packages/stable/cu129/"]
  : []
const paddlePackage = nvidiaGpu ? "paddlepaddle-gpu==3.2.1" : "paddlepaddle==3.2.1"

/** Both environments exist before the lanes start, so the model can land inside the MLX one. */
async function environments() {
  if (!existsSync(python))
    await step("paddle", "Python 환경", "uv", ["venv", "--python", "3.12", runtimeRoot])
  if (appleAcceleration && !existsSync(mlxPython))
    await step("mlx", "Python 환경", "uv", ["venv", "--python", "3.12", mlxRuntimeRoot])
}

async function paddleLane() {
  await step(
    "paddle",
    paddlePackage,
    "uv",
    ["pip", "install", "--python", python, ...paddleSource, paddlePackage],
    { key: "paddle" },
  )
  await step(
    "paddle",
    "PaddleOCR",
    "uv",
    [
      "pip",
      "install",
      "--python",
      python,
      "paddleocr[doc-parser]==3.7.0",
      "pydantic>=2.13,<3",
      "pypdfium2>=5.13,<6",
      "typer>=0.27,<1",
    ],
    { key: "paddleocr" },
  )
  await step(
    "paddle",
    `레이아웃 모델 ${layoutModel}`,
    python,
    [
      "-c",
      "import os; from paddlex import create_model; create_model(os.environ['OH_MY_PAPER_LAYOUT_MODEL'])",
    ],
    { env: { ...process.env, OH_MY_PAPER_LAYOUT_MODEL: layoutModel }, key: "layout" },
  )
}

async function mlxLane() {
  await step(
    "mlx",
    "MLX-VLM",
    "uv",
    ["pip", "install", "--python", mlxPython, "mlx-vlm==0.6.17", "jinja2==3.1.6"],
    { key: "mlx" },
  )
}

/**
 * The ~2 GB model needs neither Python environment, so it downloads from the start, in ranges
 * from Hugging Face and ModelScope at once (see model-download.mjs).
 */
async function modelLane() {
  const started = Date.now()
  say(`[model] ▶ ${mlxModelRepository}`)
  const served = await downloadRepository({
    sources: modelSources(mlxModelRepository),
    directory: mlxModelDirectory,
    onTotal: (total) => {
      model.total = total
    },
    onBytes: (count) => {
      model.bytes += count
    },
  })
  const sizes = Object.entries(served)
    .map(([host, bytes]) => `${host} ${Math.round(bytes / 1e6)}MB`)
    .join(" · ")
  say(`[model] ✔ ${mlxModelRepository} (${Math.round((Date.now() - started) / 1000)}초 · ${sizes})`)
  finished.add("model")
  writeProgress()
}

async function main() {
  takeLock()
  const started = Date.now()
  installStarted = started
  writeProgress()
  const ticker = setInterval(writeProgress, 2_000)
  await environments()
  if (appleAcceleration) {
    await Promise.all([paddleLane(), mlxLane(), modelLane()])
    writeFileSync(mlxReadinessMarker, "PaddleOCR-VL-1.6 MLX-VLM\n", { mode: 0o600 })
    await step(
      "paddle",
      "문서 분석 파이프라인",
      python,
      [
        "-c",
        "import os; from paddleocr import PaddleOCRVL; PaddleOCRVL(pipeline_version='v1.6', vl_rec_backend='mlx-vlm-server', vl_rec_server_url='http://127.0.0.1:9/', vl_rec_api_model_name=os.environ['OH_MY_PAPER_MLX_MODEL_DIR'], use_doc_orientation_classify=False, use_doc_unwarping=False, use_chart_recognition=False, use_seal_recognition=False, use_ocr_for_image_block=False)",
      ],
      { env: { ...process.env, OH_MY_PAPER_MLX_MODEL_DIR: mlxModelDirectory }, key: "pipeline" },
    )
  } else {
    await paddleLane()
    await step(
      "paddle",
      "문서 분석 파이프라인",
      python,
      [
        "-c",
        "from paddleocr import PaddleOCRVL; PaddleOCRVL(pipeline_version='v1.6', use_doc_orientation_classify=False, use_doc_unwarping=False, use_chart_recognition=False, use_seal_recognition=False, use_ocr_for_image_block=False)",
      ],
      { key: "pipeline" },
    )
  }
  clearInterval(ticker)
  writeFileSync(readinessMarker, "PaddleOCR-VL-1.6 + PP-DocLayoutV3\n", { mode: 0o600 })
  say(`oh-my-paper PaddleOCR-VL runtime: ${runtimeRoot}`)
  if (appleAcceleration) say(`oh-my-paper PaddleOCR-VL MLX runtime: ${mlxRuntimeRoot}`)
  say(`설치 완료 (${Math.round((Date.now() - started) / 1000)}초)`)
  if (process.platform === "win32" && nvidiaGpu)
    await run("vllm", process.execPath, [
      join(dirname(fileURLToPath(import.meta.url)), "setup-paddle-vllm-wsl.mjs"),
      "--optional",
    ])
}

// Exit explicitly so a slow model-size request cannot hold the finished install open.
main().then(
  () => process.exit(0),
  (error) => {
    stopChildren()
    say(`설치 실패: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  },
)
