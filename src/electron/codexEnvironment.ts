const SAFE_ENV_KEYS: readonly string[] = [
  "PATH",
  "TMPDIR",
  "TEMP",
  "TMP",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SystemRoot",
  "COMSPEC",
  "PATHEXT",
  "WINDIR",
]

export class CodexEnvironmentError extends Error {
  readonly name = "CodexEnvironmentError"

  constructor(
    readonly kind: "executable_missing" | "buffer_limit" | "subprocess_unavailable",
    message: string,
  ) {
    super(message)
  }
}

export function buildSanitizedCodexEnv(codexHome: string, workdir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of SAFE_ENV_KEYS) {
    const val = process.env[key]
    if (val !== undefined) {
      env[key] = val
    }
  }
  // biome-ignore-start lint/complexity/useLiteralKeys: index signatures require bracket access under noPropertyAccessFromIndexSignature
  env["CODEX_HOME"] = codexHome
  env["HOME"] = workdir
  env["XDG_CONFIG_HOME"] = codexHome
  // biome-ignore-end lint/complexity/useLiteralKeys: index signatures require bracket access under noPropertyAccessFromIndexSignature
  return env
}

export function buildCodexConfigToml(): string {
  return [
    'forced_login_method = "chatgpt"',
    'cli_auth_credentials_store = "keyring"',
    'web_search = "disabled"',
    'history.persistence = "none"',
    "",
    "[features]",
    "shell_tool = false",
    "unified_exec = false",
    "multi_agent = false",
    "plugins = false",
    "memories = false",
    "skill_mcp_dependency_install = false",
    "",
    "[apps._default]",
    "enabled = false",
    "",
    "[tools]",
    "web_search = false",
    "view_image = false",
    "",
    "[mcp_servers]",
    "",
  ].join("\n")
}

export function getCodexAppServerCliArgs(): readonly string[] {
  return [
    "app-server",
    "-c",
    "features.shell_tool=false",
    "-c",
    "features.unified_exec=false",
    "-c",
    "features.multi_agent=false",
    "-c",
    "apps._default.enabled=false",
    "-c",
    'web_search="disabled"',
    "-c",
    'cli_auth_credentials_store="keyring"',
    "-c",
    'forced_login_method="chatgpt"',
    "--stdio",
  ]
}

export function sanitizeErrorMessage(rawMessage: string): string {
  return rawMessage
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_KEY]")
    .replace(/bearer\s+[a-zA-Z0-9_\-.]+/gi, "[REDACTED_TOKEN]")
    .replace(/(authUrl|loginId)=[^&\s]+/gi, "$1=[REDACTED]")
}
