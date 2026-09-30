import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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
const huggingfaceHub = "huggingface_hub==2.0.0"
// Beside the runtime folders, matching paddleInstallPaths() in src/electron/paddleInstallState.ts.
const installLock = join(dirname(runtimeRoot), "paddle-vl-install.pid")

const children = new Set()

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

async function step(lane, title, command, args, env) {
  const started = Date.now()
  say(`[${lane}] ▶ ${title}`)
  await run(lane, command, args, env)
  say(`[${lane}] ✔ ${title} (${Math.round((Date.now() - started) / 1000)}초)`)
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
      if (readFileSync(installLock, "utf8").trim() === String(process.pid)) rmSync(installLock)
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
  await step("paddle", paddlePackage, "uv", [
    "pip",
    "install",
    "--python",
    python,
    ...paddleSource,
    paddlePackage,
  ])
  await step("paddle", "PaddleOCR", "uv", [
    "pip",
    "install",
    "--python",
    python,
    "paddleocr[doc-parser]==3.7.0",
    "pydantic>=2.13,<3",
    "pypdfium2>=5.13,<6",
    "typer>=0.27,<1",
  ])
  await step(
    "paddle",
    `레이아웃 모델 ${layoutModel}`,
    python,
    [
      "-c",
      "import os; from paddlex import create_model; create_model(os.environ['OH_MY_PAPER_LAYOUT_MODEL'])",
    ],
    { ...process.env, OH_MY_PAPER_LAYOUT_MODEL: layoutModel },
  )
}

async function mlxLane() {
  await step("mlx", "MLX-VLM", "uv", [
    "pip",
    "install",
    "--python",
    mlxPython,
    "mlx-vlm==0.6.17",
    "jinja2==3.1.6",
  ])
}

/**
 * The ~2 GB model needs neither Python environment, so it downloads from the start. Plain HTTPS
 * from the CDN: the Xet transfer stalled mid-file without a token, while HTTPS keeps full speed
 * and resumes an interrupted file.
 */
async function modelLane() {
  await step(
    "model",
    mlxModelRepository,
    "uv",
    [
      "tool",
      "run",
      "--python",
      "3.12",
      "--from",
      huggingfaceHub,
      "hf",
      "download",
      mlxModelRepository,
      "--local-dir",
      mlxModelDirectory,
    ],
    { ...process.env, HF_HUB_DISABLE_XET: "1" },
  )
}

async function main() {
  takeLock()
  const started = Date.now()
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
      { ...process.env, OH_MY_PAPER_MLX_MODEL_DIR: mlxModelDirectory },
    )
  } else {
    await paddleLane()
    await step("paddle", "문서 분석 파이프라인", python, [
      "-c",
      "from paddleocr import PaddleOCRVL; PaddleOCRVL(pipeline_version='v1.6', use_doc_orientation_classify=False, use_doc_unwarping=False, use_chart_recognition=False, use_seal_recognition=False, use_ocr_for_image_block=False)",
    ])
  }
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

main().catch((error) => {
  stopChildren()
  say(`설치 실패: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
