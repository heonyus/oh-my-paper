const INHERITED_ENV_KEYS: readonly string[] = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "SystemRoot",
  "COMSPEC",
  "PATHEXT",
  "WINDIR",
]

type OfflineSubprocessOverride =
  | "HF_HUB_OFFLINE"
  | "TRANSFORMERS_OFFLINE"
  | "MINERU_MODEL_SOURCE"
  | "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"
  | "PADDLE_PDX_CACHE_HOME"
  | "HF_HOME"
  | "NO_PROXY"
  | "MLX_VLM_SERVER_API_KEY"
  | "OH_MY_PAPER_VLM_API_KEY"
  | "FLAGS_allocator_strategy"

export type OfflineSubprocessOverrides = Readonly<
  Partial<Record<OfflineSubprocessOverride, string>>
>

export function buildOfflineSubprocessEnv(
  overrides: OfflineSubprocessOverrides,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const key of INHERITED_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) environment[key] = value
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) environment[key] = value
  }
  return environment
}
