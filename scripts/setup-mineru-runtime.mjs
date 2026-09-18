import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const runtimeRoot =
  process.env.SCOURGIFY_MINERU_RUNTIME ?? join(homedir(), ".scourgify", "mineru-runtime")
const scriptsDirectory = process.platform === "win32" ? "Scripts" : "bin"
const python = join(
  runtimeRoot,
  scriptsDirectory,
  process.platform === "win32" ? "python.exe" : "python",
)
const modelsDownload = join(
  runtimeRoot,
  scriptsDirectory,
  process.platform === "win32" ? "mineru-models-download.exe" : "mineru-models-download",
)

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!existsSync(python)) run("uv", ["venv", "--python", "3.12", runtimeRoot])
run("uv", ["pip", "install", "--python", python, "mineru[all]==3.4.0", "pdftext==0.6.3"])
run(modelsDownload, ["--source", "huggingface", "--model_type", "all"])
process.stdout.write(`Scourgify MinerU runtime: ${runtimeRoot}\n`)
