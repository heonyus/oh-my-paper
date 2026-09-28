import { cancel, confirm, intro, isCancel, log, note, outro, select } from "@clack/prompts"
import { AiModeStore } from "../electron/aiModeStore"
import { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import { readWebServerConfig, type WebServerConfig } from "../server/config"
import { type LocalCredentialFallback, LocalCredentialStore } from "../server/localCredentialStore"
import { DEFAULT_CLAUDE_EFFORT, DEFAULT_CLAUDE_MODEL } from "../shared/claudeTypes"
import {
  type AiMode,
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_OPTIONS,
} from "../shared/providerModels"
import { checkEnvironment, installOcrRuntime } from "./environment"
import { runApiKeyOnboarding } from "./onboardingApi"
import { runChatgptOnboarding } from "./onboardingChatgpt"
import { runClaudeOnboarding } from "./onboardingClaude"

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
      ? { openai: { provider: "openai" as const, apiKey: key, model: model ?? "gpt-4.1-mini" } }
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

async function reportEnvironment(config: WebServerConfig, codexAvailable: boolean): Promise<void> {
  log.step("실행 환경을 확인합니다")
  const report = await checkEnvironment(config, codexAvailable)

  if (report.nodeModules) log.success("Node.js 의존성 설치됨")
  else log.warn("node_modules가 없습니다 — 먼저 npm install을 실행하세요")

  if (report.codexRuntime) log.success("ChatGPT 로그인 런타임 준비됨")
  else log.warn("Codex 로그인 런타임을 찾지 못했습니다 — npm install 후 다시 확인하세요")

  if (report.ocrReady) {
    log.success("OCR 엔진(PaddleOCR-VL) 준비됨")
    return
  }
  log.warn("OCR 엔진 미설치 — 스캔 PDF·그림·표 인식에 필요합니다")
  if (!report.uvAvailable) {
    log.warn(
      "설치에는 uv가 필요합니다 — https://docs.astral.sh/uv/ 설치 후 npm run setup:paddle-vl",
    )
    return
  }
  const install = await confirm({
    message: "OCR 엔진을 지금 설치할까요? (수 GB 다운로드, 몇 분 소요)",
    initialValue: true,
  })
  if (isCancel(install) || !install) {
    log.info("건너뛰었습니다 — 나중에 npm run setup:paddle-vl 로 설치할 수 있습니다")
    return
  }
  log.step("PaddleOCR-VL 런타임과 모델을 다운로드합니다")
  if (installOcrRuntime()) log.success("OCR 엔진 설치 완료")
  else log.error("OCR 설치에 실패했습니다 — npm run setup:paddle-vl 로 다시 시도하세요")
}

export async function runOnboarding(
  config: WebServerConfig,
  outroHint = "npm run start:web 으로 시작하세요",
): Promise<boolean> {
  intro("oh-my-paper")

  const credentials = await LocalCredentialStore.open(config.dataDir, environmentFallback(config))
  const aiModes = new AiModeStore(config.dataDir)
  const subscription = new CodexSubscriptionAdapter({ appRoot: config.dataDir })
  const claude = new ClaudeSubscriptionAdapter({ appRoot: config.dataDir })

  try {
    await reportEnvironment(config, subscription.isAvailable)

    const state = await readOnboardingState(config)
    const saved = await aiModes.loadSettings().catch(() => null)
    if (state.configured) {
      note(
        `현재 연결: ${currentConnection(state, saved?.mode ?? null)}\n그대로 두려면 Enter를 눌러 건너뛰세요`,
        "이미 설정됨",
      )
    }

    const choice = await select({
      message: "AI 연결 방식을 선택하세요",
      options: [
        {
          value: "claude",
          label: "Claude 구독",
          hint: "이 Mac의 Claude Code 로그인 · 기본 모델 Sonnet 5 · 권장",
        },
        {
          value: "chatgpt",
          label: "ChatGPT 구독",
          hint: "API 키 없이 구독 사용량으로",
        },
        {
          value: "api",
          label: "API 키로 연결",
          hint: "OpenRouter · OpenAI · Gemini · Groq",
        },
        { value: "skip", label: "나중에 설정", hint: "앱 설정에서 언제든 가능" },
      ],
      initialValue: state.configured ? "skip" : "claude",
    })
    if (isCancel(choice)) {
      cancel("설정을 건너뛰었습니다")
      return false
    }

    if (choice === "claude") {
      if (!(await runClaudeOnboarding(claude))) return false
      await aiModes.save({
        ...saved,
        mode: "claude",
        claudeModel: saved?.claudeModel ?? DEFAULT_CLAUDE_MODEL,
        claudeEffort: saved?.claudeEffort ?? DEFAULT_CLAUDE_EFFORT,
      })
      note(`모델 ${saved?.claudeModel ?? DEFAULT_CLAUDE_MODEL}`, "Claude 구독 연결 완료")
    } else if (choice === "chatgpt") {
      const result = await runChatgptOnboarding(subscription)
      if (!result) return false
      await aiModes.save({
        mode: "chatgpt",
        codexModel: result.codexModel,
        codexReasoningEffort: result.codexReasoningEffort,
      })
      note(`모델 ${result.codexModel} · 추론 ${result.codexReasoningEffort}`, "구독 연결 완료")
    } else if (choice === "api") {
      const saved = await runApiKeyOnboarding(credentials)
      if (!saved) return false
      const current = await aiModes.loadSettings().catch(() => null)
      await aiModes.save({
        mode: "api",
        codexModel: current?.codexModel ?? "gpt-5.6-sol",
        codexReasoningEffort: current?.codexReasoningEffort ?? "medium",
      })
      note(`${saved.provider} · ${saved.model}`, "API 키 저장 완료")
    } else {
      log.info("앱 안의 설정 > AI 모델에서 언제든 연결할 수 있습니다")
    }

    outro(outroHint)
    return true
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

export async function runOnboardingFromEnvironment(): Promise<boolean> {
  return runOnboarding(readWebServerConfig())
}
