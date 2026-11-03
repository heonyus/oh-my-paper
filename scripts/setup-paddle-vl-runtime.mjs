import { spawn, spawnSync } from "node:child_process"
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
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
// On Windows, PaddleOCR-VL also runs in llama.cpp's server: through Vulkan on any GPU, and on the
// CPU still far faster than in-process recognition (src/electron/paddleVlmServer.ts reads this).
const llamaCppAcceleration = process.platform === "win32"
const llamaCppRoot =
  process.env.OH_MY_PAPER_PADDLE_VL_LLAMACPP ?? join(dirname(runtimeRoot), "paddle-vl-llamacpp")
const ggufRepository =
  process.env.OH_MY_PAPER_PADDLE_VL_GGUF_REPO ?? "tieubaoca/PaddleOCR-VL-1.6-GGUF"
// Beside the runtime folders, matching paddleInstallPaths() in src/electron/paddleInstallState.ts.
const installLock = join(dirname(runtimeRoot), "paddle-vl-install.pid")
const installProgress = join(dirname(runtimeRoot), "paddle-vl-install.progress.json")
// A "no" in the wizard; running the install means yes after all.
const installDeclined = join(dirname(runtimeRoot), "paddle-vl-install.declined")
// uv installed for oh-my-paper alone when the computer has none, beside the runtimes.
const uvVersion = "0.10.4"
const uvTools = join(dirname(runtimeRoot), "tools", "uv")
let uv = "uv"

const children = new Set()

/** Share of the install each part takes; on Apple silicon the model download is the long pole. */
const weights = appleAcceleration
  ? { paddle: 5, paddleocr: 10, layout: 5, mlx: 5, model: 65, pipeline: 10 }
  : llamaCppAcceleration
    ? { paddle: 10, paddleocr: 20, layout: 10, llamacpp: 20, pipeline: 40 }
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

/**
 * Runs one command, prefixing its output with the lane so parallel lanes stay readable. Python
 * writes UTF-8 to the pipe whatever the Windows code page, so paths with Korean names read right,
 * and windowsHide gives the command a hidden console that the programs it starts share: started
 * in the background, this script has no console, and each would otherwise open a window.
 */
function run(lane, command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { TQDM_MININTERVAL: "10", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
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

/** Stops the running commands with what they started: on Windows, killing one leaves its children. */
function stopChildren() {
  for (const child of children) {
    if (process.platform === "win32" && child.pid)
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      })
    else child.kill("SIGTERM")
  }
}

/**
 * Whether another install holds the lock: its process is alive and it rewrote its progress lately
 * (every 2 s). A lock left by an install cut short, at a sign-out or a reboot, can name a process
 * id that Windows has since given to another program; the stale progress tells them apart. Matches
 * paddleInstallRunning() in src/electron/paddleInstallState.ts.
 */
function lockHolderAlive() {
  let pid
  try {
    pid = Number.parseInt(readFileSync(installLock, "utf8").trim(), 10)
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    if (Date.now() - statSync(installProgress).mtimeMs > 120_000) return false
  } catch {
    return false
  }
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
  const probe = spawnSync("nvidia-smi", [], { stdio: "ignore", windowsHide: true })
  return !probe.error && probe.status === 0
})()
// The CPU wheels are on PyPI, whose CDN is much faster outside China than Paddle's own index.
const paddleSource = nvidiaGpu
  ? ["--index", "https://www.paddlepaddle.org.cn/packages/stable/cu129/"]
  : []
const paddlePackage = nvidiaGpu ? "paddlepaddle-gpu==3.2.1" : "paddlepaddle==3.2.1"

/**
 * The environment for Windows PowerShell 5.1 started from here. Started from PowerShell 7, this
 * script inherits a PSModulePath that points at PowerShell 7's modules, which 5.1 cannot load
 * ("the module could not be loaded"); without the variable, 5.1 uses its own module folders.
 */
function windowsPowerShellEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => name.toLowerCase() !== "psmodulepath"),
  )
}

/**
 * uv from PATH, or else a copy of its own: the official installer puts it in ~/.ohmypaper/tools
 * without touching shell profiles, and uv fetches Python 3.12 itself, so a computer with
 * neither still gets the engine. `OH_MY_PAPER_UV_INSTALLER` points at another installer.
 */
async function ensureUv() {
  // A uv.cmd wrapper on PATH cannot be started without a shell, so only uv.exe counts there.
  const names = process.platform === "win32" ? ["uv.exe"] : ["uv"]
  const onPath = (process.env.PATH ?? "")
    .split(delimiter)
    .some((directory) => directory && names.some((name) => existsSync(join(directory, name))))
  if (onPath) return
  const own = join(uvTools, process.platform === "win32" ? "uv.exe" : "uv")
  if (!existsSync(own)) {
    const windows = process.platform === "win32"
    const installer =
      process.env.OH_MY_PAPER_UV_INSTALLER ??
      `https://astral.sh/uv/${uvVersion}/install.${windows ? "ps1" : "sh"}`
    const env = {
      ...process.env,
      UV_UNMANAGED_INSTALL: uvTools,
      UV_NO_MODIFY_PATH: "1",
      OH_MY_PAPER_UV_INSTALLER_URL: installer,
    }
    if (windows)
      await step(
        "uv",
        "uv 설치 (이 컴퓨터에 없어서 함께 받습니다)",
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "irm $env:OH_MY_PAPER_UV_INSTALLER_URL | iex",
        ],
        { env: windowsPowerShellEnv(env) },
      )
    else
      await step(
        "uv",
        "uv 설치 (이 컴퓨터에 없어서 함께 받습니다)",
        "sh",
        ["-c", 'curl -LsSf "$OH_MY_PAPER_UV_INSTALLER_URL" | sh'],
        { env },
      )
  }
  // A failed download leaves nothing behind, and the pipe alone would not say so.
  if (!existsSync(own)) throw new Error("uv를 설치하지 못했습니다 (인터넷 연결을 확인하세요)")
  uv = own
}

/** Both environments exist before the lanes start, so the model can land inside the MLX one. */
async function environments() {
  if (!existsSync(python))
    await step("paddle", "Python 환경", uv, ["venv", "--python", "3.12", runtimeRoot])
  if (appleAcceleration && !existsSync(mlxPython))
    await step("mlx", "Python 환경", uv, ["venv", "--python", "3.12", mlxRuntimeRoot])
}

async function paddleLane() {
  await step(
    "paddle",
    paddlePackage,
    uv,
    ["pip", "install", "--python", python, ...paddleSource, paddlePackage],
    { key: "paddle" },
  )
  await step(
    "paddle",
    "PaddleOCR",
    uv,
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
    uv,
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

const requestHeaders = { "user-agent": "oh-my-paper-installer" }

async function fetchJson(url) {
  const response = await fetch(url, { headers: { ...requestHeaders, accept: "application/json" } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

/** Downloads to a temporary name first, so a cut download never looks complete. */
async function downloadFile(url, target) {
  const response = await fetch(url, { headers: requestHeaders, redirect: "follow" })
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`)
  mkdirSync(dirname(target), { recursive: true })
  const partial = `${target}.partial`
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
  renameSync(partial, target)
}

function findFile(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === name) return path
    if (entry.isDirectory()) {
      const found = findFile(path, name)
      if (found) return found
    }
  }
  return null
}

/** The first file matching each preference in turn, else the first file. */
function preferred(files, preferences) {
  for (const preference of preferences) {
    const match = files.find((file) => preference.test(file))
    if (match) return match
  }
  return files[0]
}

/**
 * llama.cpp's Windows build (Vulkan on x64, the CPU build on ARM) and PaddleOCR-VL as GGUF with
 * its vision projector. Optional: when it fails, recognition stays in-process as before.
 */
async function llamaCppLane() {
  const started = Date.now()
  say("[llamacpp] ▶ llama.cpp + PaddleOCR-VL GGUF")
  // Not just the release marked latest: some releases carry no Windows build. The newest that
  // does, among the recent ones.
  const releases = await fetchJson(
    "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30",
  )
  // Matched by parts, since llama.cpp renames its builds now and then (win/windows, order).
  const parts = process.arch === "arm64" ? [/win/i, /arm64/i, /cpu/i] : [/win/i, /vulkan/i, /x64/i]
  const wanted = {
    test: (name) =>
      name.endsWith(".zip") && !/cudart/i.test(name) && parts.every((part) => part.test(name)),
  }
  let release = null
  let asset = null
  for (const candidate of Array.isArray(releases) ? releases : []) {
    // Every llama.cpp build (bNNNN) is published as a prerelease, so only drafts are skipped.
    if (candidate.draft) continue
    asset = candidate.assets?.find((file) => wanted.test(file.name)) ?? null
    if (asset) {
      release = candidate
      break
    }
  }
  if (!release || !asset) {
    const newest = Array.isArray(releases) ? releases[0] : null
    const names = (newest?.assets ?? [])
      .map((file) => file.name)
      .filter((name) => /win/i.test(name))
    throw new Error(
      `no recent llama.cpp release has a Windows build (${newest?.tag_name}: ${names})`,
    )
  }
  const bin = join(llamaCppRoot, "bin")
  const zip = join(llamaCppRoot, asset.name)
  await downloadFile(asset.browser_download_url, zip)
  rmSync(bin, { recursive: true, force: true })
  mkdirSync(bin, { recursive: true })
  // Windows' own bsdtar opens zip files; a Git for Windows tar earlier on PATH would not.
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
  await run("llamacpp", tar, ["-xf", zip, "-C", bin])
  rmSync(zip, { force: true })
  const server = findFile(bin, "llama-server.exe")
  if (!server) throw new Error(`no llama-server.exe in ${asset.name}`)

  const hub = process.env.HF_ENDPOINT ?? "https://huggingface.co"
  const info = await fetchJson(`${hub}/api/models/${ggufRepository}`)
  const files = (info.siblings ?? [])
    .map((sibling) => sibling.rfilename)
    .filter((name) => name.toLowerCase().endsWith(".gguf"))
  const mmprojName = preferred(
    files.filter((name) => /mmproj/i.test(name)),
    [/f16/i, /bf16/i, /q8/i],
  )
  const modelName = preferred(
    files.filter((name) => !/mmproj/i.test(name)),
    [/q8_0/i, /bf16/i, /f16/i],
  )
  if (!modelName || !mmprojName)
    throw new Error(`no GGUF model with a projector in ${ggufRepository}`)
  const models = join(llamaCppRoot, "models")
  const model = join(models, modelName.split("/").at(-1))
  const mmproj = join(models, mmprojName.split("/").at(-1))
  for (const [name, target] of [
    [modelName, model],
    [mmprojName, mmproj],
  ]) {
    if (!existsSync(target))
      await downloadFile(`${hub}/${ggufRepository}/resolve/main/${name}`, target)
  }
  writeFileSync(
    join(llamaCppRoot, "runtime.json"),
    `${JSON.stringify({ version: 1, server, model, mmproj, release: release.tag_name }, null, 2)}\n`,
  )
  say(
    `[llamacpp] ✔ ${release.tag_name} · ${modelName} (${Math.round((Date.now() - started) / 1000)}초)`,
  )
}

async function main() {
  takeLock()
  rmSync(installDeclined, { force: true })
  const started = Date.now()
  installStarted = started
  writeProgress()
  const ticker = setInterval(writeProgress, 2_000)
  await ensureUv()
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
    await Promise.all([
      paddleLane(),
      llamaCppAcceleration
        ? llamaCppLane().then(
            () => finished.add("llamacpp"),
            (error) => {
              finished.add("llamacpp")
              say(
                `[llamacpp] ▲ 건너뜀, CPU로 읽습니다: ${error instanceof Error ? error.message : error}`,
              )
            },
          )
        : Promise.resolve(),
    ])
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
  writeFileSync(readinessMarker, "PaddleOCR-VL-1.6 + PP-DocLayoutV3\n", { mode: 0o600 })
  say(`oh-my-paper PaddleOCR-VL runtime: ${runtimeRoot}`)
  if (appleAcceleration) say(`oh-my-paper PaddleOCR-VL MLX runtime: ${mlxRuntimeRoot}`)
  say(`설치 완료 (${Math.round((Date.now() - started) / 1000)}초)`)
  if (process.platform === "win32" && nvidiaGpu)
    await run("vllm", process.execPath, [
      join(dirname(fileURLToPath(import.meta.url)), "setup-paddle-vllm-wsl.mjs"),
      "--optional",
    ])
  // The progress stays fresh to the end, so the lock reads as alive while the WSL step runs.
  clearInterval(ticker)
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
