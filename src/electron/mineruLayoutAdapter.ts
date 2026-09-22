import { execFile } from "node:child_process"
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { DocumentLayout } from "../shared/documentLayout"
import { mineruContentListToLayout } from "./mineruLayout"
import { buildOfflineSubprocessEnv } from "./offlineSubprocessEnvironment"

const executeFile = promisify(execFile)

export type MineruLayoutResult =
  | { readonly status: "ready"; readonly layout: DocumentLayout }
  | { readonly status: "unavailable"; readonly reason: "runtime_missing" | "analysis_failed" }

export function mineruRuntimeCommand(
  home: string,
  platform: NodeJS.Platform,
  configured?: string,
): string {
  if (configured) return configured
  const root = join(home, ".ohmypaper", "mineru-runtime")
  return platform === "win32" ? join(root, "Scripts", "mineru.exe") : join(root, "bin", "mineru")
}

async function contentListPath(root: string): Promise<string | null> {
  const entries = await readdir(root, { recursive: true })
  const relative = entries
    .filter((entry) => entry.endsWith("_content_list.json"))
    .sort((left, right) => left.localeCompare(right))[0]
  return relative ? join(root, relative) : null
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export async function runMineruLayout(input: {
  readonly command?: string
  readonly home?: string
  readonly platform?: NodeJS.Platform
  readonly pdfPath: string
  readonly sourceHash: string
}): Promise<MineruLayoutResult> {
  const home = input.home ?? homedir()
  const command = mineruRuntimeCommand(home, input.platform ?? process.platform, input.command)
  try {
    await access(command)
  } catch (error) {
    if (isMissingFile(error)) return { status: "unavailable", reason: "runtime_missing" }
    throw error
  }

  const outputRoot = await mkdtemp(join(tmpdir(), "ohmypaper-mineru-"))
  try {
    await executeFile(
      command,
      ["-p", input.pdfPath, "-o", outputRoot, "-b", "hybrid-engine", "--effort", "high"],
      {
        env: buildOfflineSubprocessEnv({
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          MINERU_MODEL_SOURCE: "local",
          HF_HOME: join(home, ".cache", "huggingface"),
        }),
        timeout: 600_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    const path = await contentListPath(outputRoot)
    if (!path) return { status: "unavailable", reason: "analysis_failed" }
    const layout = mineruContentListToLayout(
      input.sourceHash,
      JSON.parse(await readFile(path, "utf8")),
    )
    return { status: "ready", layout }
  } catch (error) {
    if (error instanceof Error) return { status: "unavailable", reason: "analysis_failed" }
    throw error
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
}
