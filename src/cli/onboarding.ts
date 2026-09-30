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
import { runApiKeyOnboarding } from "./onboardingApi"
import { runChatgptOnboarding } from "./onboardingChatgpt"
import { runClaudeOnboarding } from "./onboardingClaude"
import { offerGithubStar } from "./onboardingStar"
import { banner, bold, dim, gray, inverse } from "./style"
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
  stepTitle(1, "실행 환경", "필요한 것들이 이 컴퓨터에 준비돼 있는지 확인합니다.")
  const report = await checkEnvironment(config, codexAvailable)

  const [major = 0] = process.versions.node.split(".").map(Number)
  if (major >= 22) log.success(`Node.js ${process.versions.node}`)
  else log.warn(`Node.js ${process.versions.node} — 22 이상을 권장합니다`)

  if (report.nodeModules) log.success("의존성 설치됨")
  else log.warn("node_modules가 없습니다 — 먼저 npm install을 실행하세요")

  const built = await access(join(config.staticDir, "index.html")).then(
    () => true,
    () => false,
  )
  if (built) log.success("웹 앱 빌드됨")
  else log.warn("웹 앱이 아직 빌드되지 않았습니다 — npm run build:web")

  if (report.codexRuntime) log.success(`ChatGPT 로그인 런타임 ${dim("(앱에 포함된 Codex)")}`)
  else log.warn("Codex 로그인 런타임을 찾지 못했습니다 — npm install 후 다시 확인하세요")

  if (claudeAvailable) log.success(`Claude Code CLI ${dim("(Claude 구독 연결에 사용)")}`)
  else log.info(gray("Claude Code CLI 없음 — Claude 구독 대신 ChatGPT나 API 키를 쓸 수 있습니다"))

  return report
}

async function offerOcr(report: Awaited<ReturnType<typeof checkEnvironment>>): Promise<void> {
  stepTitle(
    2,
    "OCR 엔진 (선택)",
    "스캔 PDF와 그림·표·수식을 읽는 로컬 엔진입니다. 문서는 밖으로 나가지 않습니다.",
  )
  if (report.ocrReady) {
    log.success("PaddleOCR-VL 준비됨")
    return
  }
  if (report.ocrInstalling) {
    log.success("문서 분석 엔진은 뒤에서 준비하고 있어요")
    return
  }
  // Without uv the install fetches its own copy (and uv its own Python), so it is still offered.
  const size = report.uvAvailable ? "약 3GB" : "약 3GB · 필요한 uv도 함께 설치"
  const install = await confirm({
    message: `설치할까요? ${dim(`${size} · AI를 연결하는 동안 백그라운드로 받아 둡니다`)}`,
    initialValue: true,
  })
  if (isCancel(install) || !install) {
    // Kept, so updates and app starts do not install it anyway.
    if (!isCancel(install)) recordOcrDeclined()
    log.info(gray("건너뛰었습니다 — 나중에 npm run setup:paddle-vl 로 설치할 수 있습니다"))
    return
  }
  // It works unseen from here: papers open at once and fill in as it becomes ready.
  startOcrInstallInBackground()
  log.success(
    `문서 분석 엔진은 뒤에서 준비할게요 — 기다릴 필요 없이 바로 쓰면 됩니다\n${gray("궁금하면 oh-my-paper doctor")}`,
  )
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
  intro(inverse(" 설정 마법사 "))
  note(
    [
      "네 단계면 끝납니다.",
      `  ${bold("1")} 실행 환경 확인    ${bold("2")} OCR 엔진 (선택)`,
      `  ${bold("3")} AI 연결           ${bold("4")} 사용법 둘러보기`,
      "",
      gray("화살표로 고르고 Enter. 언제든 Ctrl+C로 나가고,"),
      gray("다시 하려면 oh-my-paper onboard"),
    ].join("\n"),
    "환영합니다",
  )

  const credentials = await LocalCredentialStore.open(config.dataDir, environmentFallback(config))
  const aiModes = new AiModeStore(config.dataDir)
  const subscription = new CodexSubscriptionAdapter({ appRoot: config.dataDir })
  const claude = new ClaudeSubscriptionAdapter({ appRoot: config.dataDir })

  try {
    const report = await reportEnvironment(config, subscription.isAvailable, claude.isAvailable)
    // Asked before AI so the download runs while the person signs in and reads the tour.
    await offerOcr(report)

    stepTitle(
      3,
      "AI 연결",
      "번역·설명·노트 튜터가 쓸 AI입니다. 구독이 있으면 API 키 없이 바로 됩니다.",
    )
    const state = await readOnboardingState(config)
    const saved = await aiModes.loadSettings().catch(() => null)
    // A Claude Code login on the machine counts as connected, but only a choice saved by this app
    // should move the cursor off ChatGPT.
    const choseBefore = await aiModes.hasSavedSettings().catch(() => false)
    if (state.configured) {
      log.info(`현재 연결: ${bold(currentConnection(state, saved?.mode ?? null))}`)
    }

    const choice = await select({
      message: "어떻게 연결할까요?",
      options: [
        {
          value: "chatgpt" as const,
          label: "ChatGPT 구독 (OpenAI)",
          hint: `ChatGPT 계정 로그인 · API 키 불필요 · ${modelLabel(CODEX_MODEL_OPTIONS, CODEX_DEFAULT_MODEL)}`,
        },
        {
          value: "claude" as const,
          label: "Claude 구독 (Anthropic)",
          hint: claude.isAvailable
            ? `이 컴퓨터의 Claude Code 로그인 · ${modelLabel(CLAUDE_MODEL_OPTIONS, DEFAULT_CLAUDE_MODEL)}`
            : "Claude Code CLI 설치가 필요합니다",
        },
        {
          value: "api" as const,
          label: "API 키",
          hint: "OpenRouter · OpenAI · Gemini · Groq · 쓴 만큼 과금",
        },
        state.configured
          ? { value: "skip" as const, label: "지금 연결 유지", hint: "바꾸지 않고 넘어갑니다" }
          : { value: "skip" as const, label: "나중에", hint: "앱의 설정 › AI에서 언제든" },
      ],
      initialValue: state.configured && choseBefore ? "skip" : "chatgpt",
    })
    if (isCancel(choice)) {
      cancel("설정을 멈췄습니다 — 다시 하려면 oh-my-paper onboard")
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
        `Claude 구독 연결 완료 ${dim(`· ${modelLabel(CLAUDE_MODEL_OPTIONS, claudeModel)}`)}`,
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
      log.success(
        `ChatGPT 구독 연결 완료 ${dim(`· ${result.codexModel} · 추론 ${result.codexReasoningEffort}`)}`,
      )
    } else if (choice === "api") {
      const savedKey = await runApiKeyOnboarding(credentials)
      if (!savedKey) return { completed: false, launch: false }
      await aiModes.save({
        ...saved,
        mode: "api",
        codexModel: saved?.codexModel ?? CODEX_DEFAULT_MODEL,
        codexReasoningEffort: saved?.codexReasoningEffort ?? "medium",
      })
      log.success(`API 키 저장 완료 ${dim(`· ${savedKey.provider} · ${savedKey.model}`)}`)
    } else if (!state.configured) {
      log.info(gray("건너뛰었습니다 — 앱을 열면 연결 화면이 먼저 나옵니다"))
    }

    stepTitle(4, "사용법", "이것만 알면 됩니다.")
    note(quickstart(appUrl(config.host, config.port), config.dataDir), "이렇게 쓰세요")
    await offerGithubStar(config.dataDir)

    if (options.launchNext) {
      outro(`준비 완료 — ${bold("oh-my-paper")}를 시작합니다`)
      return { completed: true, launch: true }
    }
    const launch = await confirm({ message: "지금 바로 열까요?", initialValue: true })
    const open = !isCancel(launch) && launch
    outro(open ? "시작합니다" : `준비 완료 — 언제든 ${bold("oh-my-paper")} 로 시작하세요`)
    return { completed: true, launch: open }
  } finally {
    subscription.dispose()
    claude.dispose()
  }
}

function currentConnection(state: OnboardingState, mode: AiMode | null): string {
  if (mode === "claude" && state.claudeConnected) {
    return `Claude 구독${state.claudeEmail ? ` (${state.claudeEmail})` : ""}`
  }
  if (state.chatgptConnected && mode !== "api") {
    return `ChatGPT 구독${state.accountEmail ? ` (${state.accountEmail})` : ""}`
  }
  if (state.apiProvider) return `${state.apiProvider} API 키`
  return state.claudeConnected ? "Claude 구독" : "없음"
}
