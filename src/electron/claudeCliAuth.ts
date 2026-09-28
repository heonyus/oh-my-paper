import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { claudeCliAuthStatusSchema } from "../shared/claudeTypes"
import { buildClaudeEnv, sanitizeClaudeMessage, stripAnsi } from "./claudeCliEnvironment"

export type ClaudeCliAuth = {
  readonly loggedIn: boolean
  readonly email: string | null
  readonly subscriptionType: string | null
}

export async function readClaudeAuthStatus(
  executablePath: string,
  timeoutMs = 15_000,
): Promise<ClaudeCliAuth> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(executablePath, ["auth", "status", "--json"], {
      env: buildClaudeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    })
    let out = ""
    let err = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("Claude 로그인 상태 확인 시간이 초과되었습니다"))
    }, timeoutMs)
    child.stdout.on("data", (chunk: Buffer) => {
      out = `${out}${chunk.toString("utf8")}`.slice(0, 65_536)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      err = `${err}${chunk.toString("utf8")}`.slice(-4_096)
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", () => {
      clearTimeout(timer)
      if (out.trim()) resolve(out)
      else reject(new Error(sanitizeClaudeMessage(err) || "Claude 로그인 상태를 읽지 못했습니다"))
    })
  })
  const parsed = claudeCliAuthStatusSchema.parse(JSON.parse(stdout))
  return {
    loggedIn: parsed.loggedIn,
    email: parsed.email ?? null,
    subscriptionType: parsed.subscriptionType ?? null,
  }
}

const LOGIN_URL = /https:\/\/[^\s"'<>]+/

/**
 * Runs `claude auth login --claudeai`, which opens the browser itself. The first
 * https URL it prints is kept so the settings page can offer it again if the
 * browser did not open.
 */
export class ClaudeLoginProcess {
  #child: ChildProcessWithoutNullStreams | null = null
  #url: string | null = null
  #timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly executablePath: string,
    private readonly onExit: (success: boolean) => void,
    private readonly timeoutMs = 10 * 60_000,
  ) {}

  get pending(): boolean {
    return this.#child !== null
  }

  get url(): string | null {
    return this.#url
  }

  /** Starts the login and waits briefly for the CLI to print its authorization URL. */
  async start(waitForUrlMs = 5_000): Promise<void> {
    if (this.#child) return
    const child = spawn(this.executablePath, ["auth", "login", "--claudeai"], {
      env: buildClaudeEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.#child = child
    this.#url = null
    this.#timer = setTimeout(() => this.cancel(), this.timeoutMs)
    let urlSeen: () => void = () => undefined
    const urlReady = new Promise<void>((resolve) => {
      urlSeen = resolve
    })
    const scan = (chunk: Buffer): void => {
      if (this.#url) return
      const match = LOGIN_URL.exec(stripAnsi(chunk.toString("utf8")))
      if (match) {
        this.#url = match[0]
        urlSeen()
      }
    }
    child.stdout.on("data", scan)
    child.stderr.on("data", scan)
    child.stdin.on("error", () => undefined)
    child.on("error", () => this.#settle(child, false))
    child.on("close", (code) => {
      this.#settle(child, code === 0)
      urlSeen()
    })
    await Promise.race([urlReady, new Promise((resolve) => setTimeout(resolve, waitForUrlMs))])
  }

  cancel(): void {
    const child = this.#child
    if (!child) return
    child.kill("SIGTERM")
    this.#settle(child, false)
  }

  #settle(child: ChildProcessWithoutNullStreams, success: boolean): void {
    if (this.#child !== child) return
    this.#child = null
    this.#url = null
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
    this.onExit(success)
  }
}
