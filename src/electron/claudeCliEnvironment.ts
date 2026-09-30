import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join, win32 } from "node:path"
import { type ClaudeEffort, claudeModelSupportsEffort } from "../shared/claudeTypes"
import { type ExecutableLookupOptions, findOnPath, pathDirectories } from "./executableLookup"

export const DEFAULT_CLAUDE_SEARCH_PATHS: readonly string[] = [
  join(homedir(), ".local/bin/claude"),
  join(homedir(), ".claude/local/claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
]

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key]
}

/** The binary that `npm install -g @anthropic-ai/claude-code` wraps in a `claude.cmd` shim. */
function npmClaudeBinary(prefix: string): string {
  return win32.join(prefix, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")
}

function windowsClaudeSearchPaths(env: NodeJS.ProcessEnv, home: string): string[] {
  const appData = envValue(env, "APPDATA")
  return [
    // The native installer's default location.
    win32.join(home, ".local", "bin", "claude.exe"),
    ...(appData ? [npmClaudeBinary(win32.join(appData, "npm"))] : []),
  ]
}

export type ClaudeExecutableLookup = Omit<ExecutableLookupOptions, "env"> & {
  readonly home?: string | undefined
}

export function findClaudeExecutable(
  customPath?: string,
  env: NodeJS.ProcessEnv = process.env,
  lookup: ClaudeExecutableLookup = {},
): string | null {
  const exists = lookup.exists ?? existsSync
  if (customPath !== undefined) return exists(customPath) ? customPath : null
  const envPath = envValue(env, "CLAUDE_PATH")
  if (envPath !== undefined && exists(envPath)) return envPath
  const options = { ...lookup, env, exists }
  const onPath = findOnPath("claude", options)
  if (onPath !== null) return onPath
  if ((lookup.platform ?? process.platform) !== "win32") {
    return DEFAULT_CLAUDE_SEARCH_PATHS.find((candidate) => exists(candidate)) ?? null
  }
  // A shim cannot be spawned without a shell, which would mangle the prompt arguments,
  // so run the binary behind an npm install's `claude.cmd` directly.
  const candidates = [
    ...pathDirectories(options).map(npmClaudeBinary),
    ...windowsClaudeSearchPaths(env, lookup.home ?? homedir()),
  ]
  return candidates.find((candidate) => exists(candidate)) ?? null
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
  // Windows equivalents of HOME and TMPDIR, plus the system paths networking and the
  // CLI's Git Bash lookup depend on.
  "USERPROFILE",
  "USERNAME",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "SystemRoot",
  "SystemDrive",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
  "CLAUDE_CODE_GIT_BASH_PATH",
] as const

export function buildClaudeEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: { readonly thinking?: boolean | undefined } = {},
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of INHERITED_ENV_KEYS) {
    const value = source[key]
    if (value !== undefined) env[key] = value
  }
  // The CLI has no thinking flag; a zero thinking budget is how it turns thinking off.
  const thinking = options.thinking === false ? { MAX_THINKING_TOKENS: "0" } : {}
  return { ...env, ...thinking, DISABLE_AUTOUPDATER: "1" }
}

export type ClaudeCompletionArgsOptions = {
  readonly model: string
  readonly effort?: ClaudeEffort | undefined
  /**
   * False runs the turn without extended thinking, and so without `--effort`, which the CLI
   * refuses once thinking is off. Pair it with `buildClaudeEnv`'s own `thinking` option.
   */
  readonly thinking?: boolean | undefined
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
    options.effort && options.thinking !== false && claudeModelSupportsEffort(options.model)
      ? ["--effort", options.effort]
      : []
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
