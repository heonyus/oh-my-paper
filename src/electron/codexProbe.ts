import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { type CodexAccountStatus, codexAccountStatusSchema } from "../shared/codexTypes"
import { CodexAppServerClient } from "./codexAppServerClient"
import { sanitizeErrorMessage } from "./codexEnvironment"
import { findCodexExecutable } from "./codexSubprocess"

export type CodexProbeOptions = {
  readonly executablePath?: string | undefined
  readonly timeoutMs?: number | undefined
}

export type CodexProbeResult = CodexAccountStatus & {
  readonly probeSucceeded: boolean
  readonly configOrigins: readonly string[]
  readonly configSafety: CodexConfigSafetySummary
}

export type CodexConfigSafetySummary = {
  readonly hasLayerMetadata: boolean
  readonly credentialsStoreIsFile: boolean
  readonly forcedLoginIsChatgpt: boolean
  readonly shellToolDisabled: boolean
  readonly unifiedExecDisabled: boolean
  readonly multiAgentDisabled: boolean
  readonly pluginsDisabled: boolean
  readonly appsDisabled: boolean
  readonly webSearchDisabled: boolean
  readonly mcpServersEmpty: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value)
  return parsed.success ? parsed.data : null
}

function booleanValue(table: Record<string, unknown> | null, key: string): boolean {
  return table?.[key] === false
}

function value(table: Record<string, unknown> | null, key: string): unknown {
  return table?.[key]
}

function summarizeConfig(
  config: Record<string, unknown>,
  layers: readonly unknown[] | undefined,
): { readonly origins: readonly string[]; readonly safety: CodexConfigSafetySummary } {
  const origins = new Set<string>()
  for (const layer of layers ?? []) {
    const parsed = z.record(z.string(), z.unknown()).safeParse(layer)
    if (!parsed.success) continue
    origins.add("redacted")
  }
  const features = record(value(config, "features"))
  const apps = record(value(config, "apps"))
  const appDefaults = record(value(apps, "_default"))
  const tools = record(value(config, "tools"))
  const mcpServers = record(value(config, "mcp_servers"))
  return {
    origins: [...origins].sort(),
    safety: {
      hasLayerMetadata: (layers?.length ?? 0) > 0,
      credentialsStoreIsFile: value(config, "cli_auth_credentials_store") === "file",
      forcedLoginIsChatgpt: value(config, "forced_login_method") === "chatgpt",
      shellToolDisabled: booleanValue(features, "shell_tool"),
      unifiedExecDisabled: booleanValue(features, "unified_exec"),
      multiAgentDisabled: booleanValue(features, "multi_agent"),
      pluginsDisabled: booleanValue(features, "plugins"),
      appsDisabled: booleanValue(appDefaults, "enabled"),
      webSearchDisabled:
        value(config, "web_search") === "disabled" ||
        value(config, "web_search") === false ||
        booleanValue(features, "web_search") ||
        booleanValue(tools, "web_search"),
      mcpServersEmpty: mcpServers !== null && Object.keys(mcpServers).length === 0,
    },
  }
}

const emptySafety: CodexConfigSafetySummary = {
  hasLayerMetadata: false,
  credentialsStoreIsFile: false,
  forcedLoginIsChatgpt: false,
  shellToolDisabled: false,
  unifiedExecDisabled: false,
  multiAgentDisabled: false,
  pluginsDisabled: false,
  appsDisabled: false,
  webSearchDisabled: false,
  mcpServersEmpty: false,
}

export async function probeCodexRuntime(options?: CodexProbeOptions): Promise<CodexProbeResult> {
  const exe = findCodexExecutable(options?.executablePath)
  if (!exe) {
    return {
      ...codexAccountStatusSchema.parse({
        available: false,
        authenticated: false,
        account: null,
        requiresOpenaiAuth: true,
        executablePath: null,
        error: "Codex executable not found",
      }),
      probeSucceeded: false,
      configOrigins: [],
      configSafety: emptySafety,
    }
  }

  const probeDir = await mkdtemp(join(tmpdir(), "codex-runtime-probe-"))
  const client = new CodexAppServerClient({
    executablePath: exe,
    codexHome: join(probeDir, "home"),
    workdir: join(probeDir, "work"),
  })

  try {
    await client.ensureStarted()
    const { account, requiresOpenaiAuth } = await client.readAccount()
    const config = await client.readEffectiveConfig()
    const authenticated = account !== null
    const configSummary = summarizeConfig(config.config, config.layers)

    return {
      ...codexAccountStatusSchema.parse({
        available: true,
        authenticated,
        account,
        requiresOpenaiAuth,
        executablePath: exe,
      }),
      probeSucceeded: true,
      configOrigins: configSummary.origins,
      configSafety: configSummary.safety,
    }
  } catch (err) {
    return {
      ...codexAccountStatusSchema.parse({
        available: true,
        authenticated: false,
        account: null,
        requiresOpenaiAuth: true,
        executablePath: exe,
        error:
          err instanceof Error
            ? sanitizeErrorMessage(err.message)
            : "Codex probe failed with an unknown error",
      }),
      probeSucceeded: false,
      configOrigins: [],
      configSafety: emptySafety,
    }
  } finally {
    client.dispose()
    await rm(probeDir, { recursive: true, force: true }).catch((error) => {
      if (!(error instanceof Error)) throw error
    })
  }
}
