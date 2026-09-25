// Installs PaddleOCR-VL behind a vLLM server inside WSL, so Windows machines with an NVIDIA
// GPU recognize pages on the GPU (about 2 s per page instead of about a minute).
// Run after `npm run setup:paddle-vl`. With --optional, a machine without WSL or a GPU is
// skipped instead of failing. Set OH_MY_PAPER_WSL_DISTRO to pick a distribution.
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const optional = process.argv.includes("--optional")
const configPath = join(homedir(), ".ohmypaper", "paddle-vllm-wsl.json")
const windowsModel = join(homedir(), ".paddlex", "official_models", "PaddleOCR-VL-1.6")
const serveScript = join(dirname(fileURLToPath(import.meta.url)), "paddle-vllm", "serve.sh")
const packages = [
  "paddleocr[doc-parser]==3.7.0",
  "paddlex==3.7.2",
  "vllm==0.10.2",
  "torch==2.8.0",
  "transformers==4.57.6",
  "einops",
  "uvloop",
  // PaddleX refuses to start its vLLM server without flash-attn, which has no sdist build
  // that works here; this is the prebuilt wheel matching torch 2.8 and Python 3.12.
  "https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu12torch2.8cxx11abiTRUE-cp312-cp312-linux_x86_64.whl",
]

function skip(message) {
  if (!optional) {
    process.stderr.write(`${message}\n`)
    process.exit(1)
  }
  process.stdout.write(`Skipping GPU acceleration: ${message}\n`)
  process.exit(0)
}

if (process.platform !== "win32") skip("vLLM in WSL is only used on Windows.")

let distro = process.env.OH_MY_PAPER_WSL_DISTRO ?? ""

function wslOutput(args) {
  const result = spawnSync("wsl.exe", [...(distro ? ["-d", distro] : []), "--", ...args], {
    encoding: "utf8",
    windowsHide: true,
  })
  return result.error || result.status !== 0 ? null : result.stdout.trim()
}

// wsl.exe passes its arguments through a shell that drops backslashes, so scripts go in on
// stdin. Bash parses the whole block before running it, so no command can read the rest.
function run(script) {
  const result = spawnSync("wsl.exe", ["-d", distro, "--", "bash", "-ls"], {
    input: `set -euo pipefail\n{\n${script}\n} </dev/null\n`,
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

distro ||= wslOutput(["bash", "-c", 'printf "%s" "$WSL_DISTRO_NAME"']) ?? ""
if (!distro) skip("WSL is not installed. Install it with `wsl --install -d Ubuntu`.")
if (distro.startsWith("docker-desktop"))
  skip("the default WSL distribution is Docker's; set OH_MY_PAPER_WSL_DISTRO=Ubuntu.")
if (wslOutput(["nvidia-smi", "-L"]) === null) skip(`no NVIDIA GPU is visible inside ${distro}.`)
const uv = wslOutput(["bash", "-lc", "command -v uv"])
if (!uv)
  skip(
    `uv is missing in ${distro}. Install it there with: curl -LsSf https://astral.sh/uv/install.sh | sh`,
  )
const home = wslOutput(["bash", "-c", 'printf "%s" "$HOME"'])
if (!home) skip(`could not read the home directory in ${distro}.`)
const root = `${home}/.ohmypaper/paddle-vllm`
const model = `${root}/models/PaddleOCR-VL-1.6`
process.stdout.write(`Installing the PaddleOCR-VL vLLM server into ${distro}:${root}\n`)

// uv's managed Python ships its C headers, which Triton needs to build GPU kernels.
run(`mkdir -p '${root}/models'
if [ ! -x '${root}/.venv/bin/python' ]; then
  UV_PYTHON_PREFERENCE=only-managed '${uv}' venv --python 3.12 '${root}/.venv'
fi
'${uv}' pip install --python '${root}/.venv/bin/python' ${packages.map((spec) => `'${spec}'`).join(" ")}`)

const copiedModel = wslOutput(["wslpath", "-u", windowsModel.replaceAll("\\", "/")])
const serve = readFileSync(serveScript, "utf8").replaceAll("\r", "")
run(`if [ ! -f '${model}/model.safetensors' ]; then
  rm -rf '${model}.partial'
  if [ -f '${copiedModel ?? "/missing"}/model.safetensors' ]; then
    cp -r '${copiedModel}' '${model}.partial'
  else
    '${root}/.venv/bin/python' -c "from huggingface_hub import snapshot_download; snapshot_download('PaddlePaddle/PaddleOCR-VL-1.6', local_dir='${model}.partial')"
  fi
  mv '${model}.partial' '${model}'
fi
cat >'${root}/serve.sh' <<'OH_MY_PAPER_SERVE_SH'
${serve}OH_MY_PAPER_SERVE_SH
chmod 755 '${root}/serve.sh'`)

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// Start the server once the way the app does; the first start also compiles CUDA kernels.
process.stdout.write(
  "Starting the server once to check it (the first start takes a few minutes)…\n",
)
const port = await freePort()
const apiKey = randomUUID()
const server = spawn("wsl.exe", ["-d", distro, "--", "bash", `${root}/serve.sh`, String(port)], {
  stdio: ["pipe", "inherit", "inherit"],
  windowsHide: true,
})
server.stdin.write(`${apiKey}\n`)
const deadline = Date.now() + 15 * 60_000
let ready = false
while (!ready && server.exitCode === null && Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2_000),
    })
    ready = response.ok
  } catch {}
  if (!ready) await new Promise((resolve) => setTimeout(resolve, 2_000))
}
server.stdin.end()
await new Promise((resolve) => {
  if (server.exitCode !== null) resolve()
  else server.once("exit", resolve)
})
if (!ready) {
  process.stderr.write("The vLLM server did not start; see its log above.\n")
  process.exit(1)
}

mkdirSync(dirname(configPath), { recursive: true })
const temporary = `${configPath}.${process.pid}.tmp`
writeFileSync(temporary, `${JSON.stringify({ version: 1, distro, root }, null, 2)}\n`, {
  mode: 0o600,
})
renameSync(temporary, configPath)
process.stdout.write(`oh-my-paper GPU recognition ready: ${configPath}\n`)
