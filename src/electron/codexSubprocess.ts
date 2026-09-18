import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, mkdir, symlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import {
  buildCodexConfigToml,
  buildSanitizedCodexEnv,
  CodexEnvironmentError,
  getCodexAppServerCliArgs,
} from "./codexEnvironment"

export const DEFAULT_CODEX_SEARCH_PATHS: readonly string[] = [
  "/opt/homebrew/bin/codex",
  "/usr/local/bin/codex",
  join(homedir(), ".local/bin/codex"),
  join(homedir(), ".cargo/bin/codex"),
]

export function findCodexExecutable(customPath?: string): string | null {
  if (customPath !== undefined) {
    return existsSync(customPath) ? customPath : null
  }
  const codexPathEnvKey = "CODEX_PATH"
  const envCodexPath = process.env[codexPathEnvKey]
  if (envCodexPath !== undefined && existsSync(envCodexPath)) {
    return envCodexPath
  }
  const pathEnvKey = "PATH"
  const envPath = process.env[pathEnvKey] ?? ""
  const pathDirs = envPath.split(delimiter)
  for (const dir of pathDirs) {
    const candidate = join(dir, process.platform === "win32" ? "codex.exe" : "codex")
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }
  for (const candidate of DEFAULT_CODEX_SEARCH_PATHS) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export type CodexSubprocessOptions = {
  readonly executablePath?: string | undefined
  readonly codexHome: string
  readonly workdir: string
}

const MAX_BUFFER_CHARS = 2 * 1024 * 1024

export class CodexSubprocess {
  #process: ChildProcessWithoutNullStreams | null = null
  #onLineCallback: ((line: string) => void) | null = null
  #onErrorCallback: ((error: Error) => void) | null = null
  #onExitCallback: ((code: number | null) => void) | null = null
  #buffer = ""

  constructor(readonly options: CodexSubprocessOptions) {}

  get isRunning(): boolean {
    return this.#process !== null && !this.#process.killed
  }

  async start(): Promise<void> {
    if (this.#process) return
    const exe = findCodexExecutable(this.options.executablePath)
    if (!exe) {
      throw new CodexEnvironmentError("executable_missing", "Codex executable not found")
    }

    await mkdir(this.options.codexHome, { recursive: true })
    await mkdir(this.options.workdir, { recursive: true })
    await chmod(this.options.codexHome, 0o700)
    await chmod(this.options.workdir, 0o700)
    if (process.platform === "darwin") {
      const userKeychains = join(homedir(), "Library", "Keychains")
      const workLibrary = join(this.options.workdir, "Library")
      const workKeychains = join(workLibrary, "Keychains")
      if (existsSync(userKeychains) && !existsSync(workKeychains)) {
        try {
          await mkdir(workLibrary, { recursive: true, mode: 0o700 })
          await symlink(userKeychains, workKeychains, "dir")
        } catch {
          void 0
        }
      }
    }
    await writeFile(join(this.options.codexHome, "config.toml"), buildCodexConfigToml(), "utf8")
    await chmod(join(this.options.codexHome, "config.toml"), 0o600)

    const env = buildSanitizedCodexEnv(this.options.codexHome, this.options.workdir)
    const args = getCodexAppServerCliArgs()

    const child = spawn(exe, [...args], {
      cwd: this.options.workdir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.#process = child

    child.stdout.on("data", (chunk: Buffer) => {
      if (this.#process !== child) return
      this.#handleChunk(chunk.toString("utf8"))
    })

    // Drain stderr safely without leaking sensitive tokens/prompts
    child.stderr.on("data", (_chunk: Buffer) => {
      // Safely discarded to avoid pipe deadlock
    })

    child.on("error", (err) => {
      if (this.#process !== child) return
      if (this.#onErrorCallback) this.#onErrorCallback(err)
    })

    child.on("exit", (code) => {
      if (this.#process !== child) return
      this.#process = null
      if (this.#onExitCallback) this.#onExitCallback(code)
    })
  }

  #handleChunk(text: string): void {
    this.#buffer += text
    if (this.#buffer.length > MAX_BUFFER_CHARS) {
      this.#buffer = ""
      if (this.#onErrorCallback) {
        this.#onErrorCallback(
          new CodexEnvironmentError("buffer_limit", "Codex stdout buffer exceeded limit"),
        )
      }
      return
    }
    const lines = this.#buffer.split("\n")
    this.#buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length > 0 && this.#onLineCallback) {
        this.#onLineCallback(trimmed)
      }
    }
  }

  onLine(callback: (line: string) => void): void {
    this.#onLineCallback = callback
  }

  onError(callback: (error: Error) => void): void {
    this.#onErrorCallback = callback
  }

  onExit(callback: (code: number | null) => void): void {
    this.#onExitCallback = callback
  }

  writeLine(line: string): void {
    if (!this.#process?.stdin.writable) {
      throw new CodexEnvironmentError(
        "subprocess_unavailable",
        "Codex subprocess is not running or stdin is closed",
      )
    }
    this.#process.stdin.write(`${line}\n`)
  }

  stop(): void {
    if (!this.#process) return
    try {
      this.#process.kill()
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }
    } finally {
      this.#process = null
      this.#buffer = ""
    }
  }
}
