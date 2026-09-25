import { spawnSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
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

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const nvidiaGpu = (() => {
  if (appleAcceleration) return false
  const probe = spawnSync("nvidia-smi", [], { stdio: "ignore" })
  return !probe.error && probe.status === 0
})()
const paddleIndex = `https://www.paddlepaddle.org.cn/packages/stable/${nvidiaGpu ? "cu129" : "cpu"}/`
const paddlePackage = nvidiaGpu ? "paddlepaddle-gpu==3.2.1" : "paddlepaddle==3.2.1"

if (!existsSync(python)) run("uv", ["venv", "--python", "3.12", runtimeRoot])
run("uv", ["pip", "install", "--python", python, "--index", paddleIndex, paddlePackage])
run("uv", [
  "pip",
  "install",
  "--python",
  python,
  "paddleocr[doc-parser]==3.7.0",
  "pydantic>=2.13,<3",
  "pypdfium2>=5.13,<6",
  "typer>=0.27,<1",
])
run(
  python,
  [
    "-c",
    "import os; from paddlex import create_model; create_model(os.environ['OH_MY_PAPER_LAYOUT_MODEL'])",
  ],
  { ...process.env, OH_MY_PAPER_LAYOUT_MODEL: layoutModel },
)
if (appleAcceleration) {
  if (!existsSync(mlxPython)) run("uv", ["venv", "--python", "3.12", mlxRuntimeRoot])
  run("uv", ["pip", "install", "--python", mlxPython, "mlx-vlm==0.6.17", "jinja2==3.1.6"])
  run(
    mlxPython,
    [
      "-c",
      "import os; from huggingface_hub import snapshot_download; snapshot_download(repo_id=os.environ['OH_MY_PAPER_MLX_MODEL_REPOSITORY'], local_dir=os.environ['OH_MY_PAPER_MLX_MODEL_DIR'])",
    ],
    {
      ...process.env,
      OH_MY_PAPER_MLX_MODEL_DIR: mlxModelDirectory,
      OH_MY_PAPER_MLX_MODEL_REPOSITORY: mlxModelRepository,
    },
  )
  writeFileSync(mlxReadinessMarker, "PaddleOCR-VL-1.6 MLX-VLM\n", { mode: 0o600 })
  run(
    python,
    [
      "-c",
      "import os; from paddleocr import PaddleOCRVL; PaddleOCRVL(pipeline_version='v1.6', vl_rec_backend='mlx-vlm-server', vl_rec_server_url='http://127.0.0.1:9/', vl_rec_api_model_name=os.environ['OH_MY_PAPER_MLX_MODEL_DIR'], use_doc_orientation_classify=False, use_doc_unwarping=False, use_chart_recognition=False, use_seal_recognition=False, use_ocr_for_image_block=False)",
    ],
    { ...process.env, OH_MY_PAPER_MLX_MODEL_DIR: mlxModelDirectory },
  )
} else {
  run(python, [
    "-c",
    "from paddleocr import PaddleOCRVL; PaddleOCRVL(pipeline_version='v1.6', use_doc_orientation_classify=False, use_doc_unwarping=False, use_chart_recognition=False, use_seal_recognition=False, use_ocr_for_image_block=False)",
  ])
}
writeFileSync(readinessMarker, "PaddleOCR-VL-1.6 + PP-DocLayoutV3\n", { mode: 0o600 })
process.stdout.write(`oh-my-paper PaddleOCR-VL runtime: ${runtimeRoot}\n`)
if (appleAcceleration)
  process.stdout.write(`oh-my-paper PaddleOCR-VL MLX runtime: ${mlxRuntimeRoot}\n`)
if (process.platform === "win32" && nvidiaGpu)
  run(process.execPath, [
    join(dirname(fileURLToPath(import.meta.url)), "setup-paddle-vllm-wsl.mjs"),
    "--optional",
  ])
