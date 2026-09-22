import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const runtimeRoot =
  process.env.OH_MY_PAPER_LAYOUT_RUNTIME ?? join(homedir(), ".ohmypaper", "layout-runtime")
const python =
  process.platform === "win32"
    ? join(runtimeRoot, "Scripts", "python.exe")
    : join(runtimeRoot, "bin", "python")

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!existsSync(python)) run("uv", ["venv", "--python", "3.12", runtimeRoot])
run("uv", [
  "pip",
  "install",
  "--python",
  python,
  "paddleocr[doc-parser]==3.7.0",
  "pypdfium2>=5.13,<6",
  "torch>=2.13,<3",
  "torchvision>=0.28,<1",
  "transformers>=5.8,<6",
  "typer>=0.27,<1",
])
run(python, [
  "-c",
  "from paddlex import create_model; create_model('PP-DocLayout_plus-L', engine='transformers', device='cpu')",
])
process.stdout.write(`oh-my-paper local layout runtime: ${runtimeRoot}\n`)
