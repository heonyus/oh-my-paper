import { access } from "node:fs/promises"
import { join } from "node:path"
import { cancel, confirm, intro, isCancel, log, note, outro, select } from "@clack/prompts"
import { AiModeStore } from "../electron/aiModeStore"
import { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import type { WebServerConfig } from "../server/config"
import { type LocalCredentialFallback, LocalCredentialStore } from "../server/localCredentialStore"
import {
  CLAUDE_MODEL_OPTIONS,
  DEFAULT_CLAUDE_EFFORT,
  DEFAULT_CLAUDE_MODEL,
} from "../shared/claudeTypes"
import { CODEX_DEFAULT_MODEL, CODEX_MODEL_OPTIONS } from "../shared/codexTypes"
import {
  type AiMode,
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_OPTIONS,
} from "../shared/providerModels"
import { checkEnvironment, recordOcrDeclined, startOcrInstallInBackground } from "./environment"
import { t } from "./messages"
import { runApiKeyOnboarding } from "./onboardingApi"
import { runChatgptOnboarding } from "./onboardingChatgpt"
import { runClaudeOnboarding } from "./onboardingClaude"
import { offerGithubStar } from "./onboardingStar"
import { banner, bold, dim, gray, inverse, padEnd } from "./style"
import { appUrl, quickstart } from "./tutorial"
import { packageVersion } from "./version"

function environmentFallback(config: WebServerConfig): LocalCredentialFallback {
  const provider = config.provider
  const key = provider ? config.apiKeys[provider] : null
  const model = config.model
  const openRouterModel =
    OPENROUTER_MODEL_OPTIONS.find((option) => option === model) ?? DEFAULT_OPENROUTER_MODEL
  return {
    openrouter:
      provider === "openrouter" && key
        ? { provider: "openrouter", apiKey: key, model: openRouterModel }
        : null,
    ...(provider === "openai" && key
      ? { openai: { provider: "openai" as const, apiKey: key, model: model ?? "gpt-6-luna" } }
      : {}),
    ...(provider === "gemini" && key
      ? {
          gemini: {
            provider: "gemini" as const,
            apiKey: key,
            model: model ?? "gemini-3.5-flash-lite",
          },
        }
      : {}),
    ...(provider === "groq" && key
      ? { groq: { provider: "groq" as const, apiKey: key, model: model ?? "openai/gpt-oss-20b" } }
      : {}),
  }
}

export type OnboardingState = {
  readonly configured: boolean
  readonly chatgptConnected: boolean
  readonly claudeConnected: boolean
  readonly accountEmail: string | null
  readonly claudeEmail: string | null
  readonly apiProvider: string | null
}

export async function readOnboardingState(config: WebServerConfig): Promise<OnboardingState> {
  const credentials = await LocalCredentialStore.open(config.dataDir, environmentFallback(config))
  const subscription = new CodexSubscriptionAdapter({ appRoot: config.dataDir })
  const claude = new ClaudeSubscriptionAdapter({ appRoot: config.dataDir })
  try {
    const [account, claudeAccount] = await Promise.all([
      subscription.getStatus(),
      claude.getStatus(),
    ])
    const provider = credentials.providerConfig()
    const email =
      account.account && "email" in account.account && account.account.email
        ? String(account.account.email)
        : null
    return {
      configured: account.authenticated || claudeAccount.authenticated || provider !== null,
      chatgptConnected: account.authenticated,
      claudeConnected: claudeAccount.authenticated,
      accountEmail: email,
      claudeEmail: claudeAccount.email,
      apiProvider: provider?.provider ?? null,
    }
  } finally {
    subscription.dispose()
    claude.dispose()
  }
}

function modelLabel(
  options: ReadonlyArray<{ readonly id: string; readonly label: string }>,
  id: string,
): string {
  return (options.find((option) => option.id === id)?.label ?? id).replace(/\s*\(.*\)$/, "")
}

function stepTitle(index: number, title: string, detail: string): void {
  log.step(`${bold(`${index}/4  ${title}`)}\n${gray(detail)}`)
}

async function reportEnvironment(
  config: WebServerConfig,
  codexAvailable: boolean,
  claudeAvailable: boolean,
): Promise<Awaited<ReturnType<typeof checkEnvironment>>> {
  stepTitle(1, t("env.title"), t("env.detail"))
  const report = await checkEnvironment(config, codexAvailable)

  const [major = 0] = process.versions.node.split(".").map(Number)
  if (major >= 22) log.success(`Node.js ${process.versions.node}`)
  else log.warn(t("env.nodeOld", { version: process.versions.node }))

  if (report.nodeModules) log.success(t("env.depsOk"))
  else log.warn(t("env.depsMissing"))

  const built = await access(join(config.staticDir, "index.html")).then(
    () => true,
    () => false,
  )
  if (built) log.success(t("env.webOk"))
  else log.warn(t("env.webMissing"))

  if (report.codexRuntime) log.success(`${t("env.codexOk")} ${dim(t("env.codexOkDetail"))}`)
  else log.warn(t("env.codexMissing"))

  if (claudeAvailable) log.success(`Claude Code CLI ${dim(t("env.claudeOkDetail"))}`)
  else log.info(gray(t("env.claudeMissing")))

  return report
}

async function offerOcr(report: Awaited<ReturnType<typeof checkEnvironment>>): Promise<void> {
  stepTitle(2, t("ocr.title"), t("ocr.detail"))
  if (report.ocrReady) {
    log.success(t("ocr.ready"))
    return
  }
  if (report.ocrInstalling) {
    log.success(t("ocr.installing"))
    return
  }
  // Without uv the install fetches its own copy (and uv its own Python), so it is still offered.
  const size = t(report.uvAvailable ? "ocr.size" : "ocr.sizeWithUv")
  const install = await confirm({
    message: `${t("ocr.ask")} ${dim(t("ocr.askDetail", { size }))}`,
    initialValue: true,
  })
  if (isCancel(install) || !install) {
    // Kept, so updates and app starts do not install it anyway.
    if (!isCancel(install)) recordOcrDeclined()
    log.info(gray(t("ocr.skipped")))
    return
  }
  // It works unseen from here: papers open at once and fill in as it becomes ready.
  startOcrInstallInBackground()
  log.success(`${t("ocr.started")}\n${gray(t("ocr.startedHint"))}`)
}

export type OnboardingOutcome = {
  /** False when the user cancelled before an AI connection was chosen. */
  readonly completed: boolean
  /** The user asked to open the app right away. */
  readonly launch: boolean
}

/**
 * The terminal setup wizard: environment, AI connection, optional OCR, a short tour, then one
 * optional GitHub star invitation.
 * `launchNext` is set when the caller starts the app anyway, so the last question is skipped.
 */
export async function runOnboarding(
  config: WebServerConfig,
  options: { readonly launchNext?: boolean } = {},
): Promise<OnboardingOutcome> {
  process.stdout.write(`${banner(packageVersion())}\n`)
  intro(inverse(` ${t("wizard.title")} `))
  note(
    [
      t("wizard.intro"),
      `  ${bold("1")} ${padEnd(t("wizard.step1"), 22)}${bold("2")} ${t("wizard.step2")}`,
      `  ${bold("3")} ${padEnd(t("wizard.step3"), 22)}${bold("4")} ${t("wizard.step4")}`,
      "",
      gray(t("wizard.keys")),
      gray(t("wizard.again")),
    ].join("\n"),
    t("wizard.welcome"),
  )

  const credentials = await LocalCredentialStore.open(config.dataDir, environmentFallback(config))
  const aiModes = new AiModeStore(config.dataDir)
  const subscription = new CodexSubscriptionAdapter({ appRoot: config.dataDir })
  const claude = new ClaudeSubscriptionAdapter({ appRoot: config.dataDir })

  try {
    const report = await reportEnvironment(config, subscription.isAvailable, claude.isAvailable)
    // Asked before AI so the download runs while the person signs in and reads the tour.
    await offerOcr(report)

    stepTitle(3, t("ai.title"), t("ai.detail"))
    const state = await readOnboardingState(config)
    const saved = await aiModes.loadSettings().catch(() => null)
    // A Claude Code login on the machine counts as connected, but only a choice saved by this app
    // should move the cursor off ChatGPT.
    const choseBefore = await aiModes.hasSavedSettings().catch(() => false)
    if (state.configured) {
      log.info(t("ai.current", { connection: bold(currentConnection(state, saved?.mode ?? null)) }))
    }

    const choice = await select({
      message: t("ai.ask"),
      options: [
        {
          value: "chatgpt" as const,
          label: t("ai.chatgpt"),
          hint: t("ai.chatgptHint", {
            model: modelLabel(CODEX_MODEL_OPTIONS, CODEX_DEFAULT_MODEL),
          }),
        },
        {
          value: "claude" as const,
          label: t("ai.claude"),
          hint: claude.isAvailable
            ? t("ai.claudeHint", { model: modelLabel(CLAUDE_MODEL_OPTIONS, DEFAULT_CLAUDE_MODEL) })
            : t("ai.claudeMissing"),
        },
        {
          value: "api" as const,
          label: t("ai.apiKey"),
          hint: t("ai.apiKeyHint"),
        },
        state.configured
          ? { value: "skip" as const, label: t("ai.keep"), hint: t("ai.keepHint") }
          : { value: "skip" as const, label: t("ai.later"), hint: t("ai.laterHint") },
      ],
      initialValue: state.configured && choseBefore ? "skip" : "chatgpt",
    })
    if (isCancel(choice)) {
      cancel(t("wizard.cancelled"))
      return { completed: false, launch: false }
    }

    if (choice === "claude") {
      if (!(await runClaudeOnboarding(claude))) return { completed: false, launch: false }
      const claudeModel = saved?.claudeModel ?? DEFAULT_CLAUDE_MODEL
      await aiModes.save({
        ...saved,
        mode: "claude",
        claudeModel,
        claudeEffort: saved?.claudeEffort ?? DEFAULT_CLAUDE_EFFORT,
      })
      log.success(
        `${t("ai.claudeDone")} ${dim(`· ${modelLabel(CLAUDE_MODEL_OPTIONS, claudeModel)}`)}`,
      )
    } else if (choice === "chatgpt") {
      const result = await runChatgptOnboarding(subscription)
      if (!result) return { completed: false, launch: false }
      await aiModes.save({
        ...saved,
        mode: "chatgpt",
        codexModel: result.codexModel,
        codexReasoningEffort: result.codexReasoningEffort,
      })
      const detail = t("ai.chatgptDoneDetail", {
        model: result.codexModel,
        effort: result.codexReasoningEffort,
      })
      log.success(`${t("ai.chatgptDone")} ${dim(`· ${detail}`)}`)
    } else if (choice === "api") {
      const savedKey = await runApiKeyOnboarding(credentials)
      if (!savedKey) return { completed: false, launch: false }
      await aiModes.save({
        ...saved,
        mode: "api",
        codexModel: saved?.codexModel ?? CODEX_DEFAULT_MODEL,
        codexReasoningEffort: saved?.codexReasoningEffort ?? "medium",
      })
      log.success(`${t("ai.apiDone")} ${dim(`· ${savedKey.provider} · ${savedKey.model}`)}`)
    } else if (!state.configured) {
      log.info(gray(t("ai.skipped")))
    }

    stepTitle(4, t("tour.title"), t("tour.detail"))
    note(quickstart(appUrl(config.host, config.port), config.dataDir), t("tour.noteTitle"))
    await offerGithubStar(config.dataDir)

    if (options.launchNext) {
      outro(t("wizard.readyStart", { app: bold("oh-my-paper") }))
      return { completed: true, launch: true }
    }
    const launch = await confirm({ message: t("wizard.openNow"), initialValue: true })
    const open = !isCancel(launch) && launch
    outro(open ? t("wizard.starting") : t("wizard.readyLater", { app: bold("oh-my-paper") }))
    return { completed: true, launch: open }
  } finally {
    subscription.dispose()
    claude.dispose()
  }
}

function currentConnection(state: OnboardingState, mode: AiMode | null): string {
  if (mode === "claude" && state.claudeConnected) {
    return `${t("conn.claude")}${state.claudeEmail ? ` (${state.claudeEmail})` : ""}`
  }
  if (state.chatgptConnected && mode !== "api") {
    return `${t("conn.chatgpt")}${state.accountEmail ? ` (${state.accountEmail})` : ""}`
  }
  if (state.apiProvider) return t("conn.api", { provider: state.apiProvider })
  return state.claudeConnected ? t("conn.claude") : t("conn.none")
}
