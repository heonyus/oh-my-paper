import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { type ClaudeEffort, claudeModelSupportsEffort } from "../shared/claudeTypes"

export const DEFAULT_CLAUDE_SEARCH_PATHS: readonly string[] = [
  join(homedir(), ".local/bin/claude"),
  join(homedir(), ".claude/local/claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
]

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key]
}

export function findClaudeExecutable(
  customPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (customPath !== undefined) return existsSync(customPath) ? customPath : null
  const envPath = envValue(env, "CLAUDE_PATH")
  if (envPath !== undefined && existsSync(envPath)) return envPath
  for (const dir of (envValue(env, "PATH") ?? "").split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, process.platform === "win32" ? "claude.exe" : "claude")
    if (existsSync(candidate)) return candidate
  }
  for (const candidate of DEFAULT_CLAUDE_SEARCH_PATHS) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Only what the CLI needs to find its own login. API keys, auth tokens and base-URL
 * overrides are dropped so a request can never silently bill a paid API instead of
 * the subscription, and a parent Claude Code session's markers do not leak in.
 */
const INHERITED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "CLAUDE_CONFIG_DIR",
] as const

export function buildClaudeEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of INHERITED_ENV_KEYS) {
    const value = source[key]
    if (value !== undefined) env[key] = value
  }
  return { ...env, DISABLE_AUTOUPDATER: "1" }
}

export type ClaudeCompletionArgsOptions = {
  readonly model: string
  readonly effort?: ClaudeEffort | undefined
  readonly systemPrompt: string
  /** Enforced output schema; the CLI answers through its StructuredOutput tool. */
  readonly jsonSchema?: Readonly<Record<string, unknown>> | undefined
  /** Built-in tools the turn may call; none by default, so a request stays a plain completion. */
  readonly tools?: readonly string[] | undefined
  /** Upper bound on agentic turns when tools are allowed. */
  readonly maxTurns?: number | undefined
}

export function buildClaudeCompletionArgs(options: ClaudeCompletionArgsOptions): string[] {
  const effort =
    options.effort && claudeModelSupportsEffort(options.model) ? ["--effort", options.effort] : []
  const tools = options.tools?.join(",") ?? ""
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model",
    options.model,
    ...effort,
    "--tools",
    tools,
    ...(tools ? ["--allowedTools", tools] : []),
    ...(options.maxTurns ? ["--max-turns", String(options.maxTurns)] : []),
    "--safe-mode",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--system-prompt",
    options.systemPrompt,
    ...(options.jsonSchema ? ["--json-schema", JSON.stringify(options.jsonSchema)] : []),
  ]
}

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g")

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "")
}

export function sanitizeClaudeMessage(value: string): string {
  return stripAnsi(value)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .trim()
    .slice(0, 500)
}
