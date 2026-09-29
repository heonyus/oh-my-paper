import { execFile } from "node:child_process"
import { confirm, isCancel, log, note, select, spinner } from "@clack/prompts"
import type { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import {
  type CodexLoginCompletedEvent,
  type CodexLoginStartResult,
  type CodexModel,
  codexReasoningEffortOptions,
  defaultCodexModel,
} from "../shared/codexTypes"
import { type CodexReasoningEffort, codexReasoningEffortSchema } from "../shared/ipc"
import { bold, dim, link } from "./style"

const DEFAULT_EFFORT: CodexReasoningEffort = "medium"

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"
  const args =
    process.platform === "darwin"
      ? [url]
      : process.platform === "win32"
        ? ["/c", "start", "", url]
        : [url]
  execFile(command, args, () => undefined)
}

async function waitForLogin(
  subscription: CodexSubscriptionAdapter,
  loginId: string,
): Promise<CodexLoginCompletedEvent> {
  const wait = spinner()
  wait.start("브라우저에서 로그인을 기다리는 중… (취소: Ctrl+C)")
  try {
    return await new Promise<CodexLoginCompletedEvent>((resolve) => {
      const unsubscribe = subscription.onLoginCompleted((event) => {
        if (event.loginId && event.loginId !== loginId) return
        unsubscribe()
        resolve(event)
      })
    })
  } finally {
    wait.stop("로그인 응답을 받았습니다")
  }
}

async function chooseSubscriptionModel(models: readonly CodexModel[]): Promise<{
  codexModel: string
  codexReasoningEffort: CodexReasoningEffort
} | null> {
  const codexModel = await select({
    message: "구독 모델을 선택하세요",
    options: models.map((option) => ({
      value: option.id,
      label: option.label,
      ...(option.description ? { hint: option.description } : {}),
    })),
    initialValue: defaultCodexModel(models),
  })
  if (isCancel(codexModel)) return null

  const effortOptions = codexReasoningEffortOptions(codexModel, models)
  const effort = await select({
    message: "추론 수준(Thinking) — 높을수록 깊게 생각하고 느려집니다",
    options: effortOptions.map((option) => ({ value: option.id, label: option.label })),
    initialValue: effortOptions.some((option) => option.id === DEFAULT_EFFORT)
      ? DEFAULT_EFFORT
      : effortOptions[0]?.id,
  })
  if (isCancel(effort)) return null

  return { codexModel, codexReasoningEffort: codexReasoningEffortSchema.parse(effort) }
}

/** Signs in through the bundled Codex runtime (or reuses its login), then picks a model. */
export async function runChatgptOnboarding(
  subscription: CodexSubscriptionAdapter,
): Promise<{ codexModel: string; codexReasoningEffort: CodexReasoningEffort } | null> {
  if (!subscription.isAvailable) {
    note(
      "번들된 Codex 실행 파일을 찾지 못했습니다.\n의존성을 다시 설치한 뒤 시도하세요: npm install",
      "연결 불가",
    )
    return null
  }

  const checking = spinner()
  checking.start("ChatGPT 로그인 상태를 확인하는 중…")
  const current = await subscription.getStatus()
  const currentEmail =
    current.account && "email" in current.account ? String(current.account.email ?? "") : ""
  checking.stop(
    current.authenticated
      ? `이미 로그인돼 있습니다${currentEmail ? ` (${currentEmail})` : ""}`
      : "로그인이 필요합니다",
  )

  if (!current.authenticated) {
    const method = await select({
      message: "OpenAI 로그인 방식",
      options: [
        {
          value: "chatgpt",
          label: "브라우저로 로그인",
          hint: "이 Mac의 브라우저가 열립니다 · 권장",
        },
        {
          value: "chatgptDeviceCode",
          label: "기기 코드로 로그인",
          hint: "SSH·원격 터미널처럼 브라우저가 없을 때",
        },
      ],
    })
    if (isCancel(method)) return null

    let started: CodexLoginStartResult
    try {
      started = await subscription.startLogin(method)
    } catch (error) {
      log.error(error instanceof Error ? error.message : "로그인을 시작하지 못했습니다")
      return null
    }

    if (started.type === "chatgpt") {
      openBrowser(started.authUrl)
      note(
        `브라우저에서 ChatGPT 계정으로 로그인하고 ${bold("승인")}을 누르세요.\n창이 안 열리면 아래 주소를 여세요:\n${link(started.authUrl)}`,
        "ChatGPT 로그인",
      )
    } else if (started.type === "chatgptDeviceCode") {
      note(
        `1. 아래 주소를 아무 기기에서나 여세요\n   ${link(started.verificationUrl)}\n2. 이 코드를 입력하세요   ${bold(started.userCode)}`,
        "기기 코드 로그인",
      )
    } else {
      log.error("지원하지 않는 로그인 방식이 반환됐습니다")
      return null
    }

    const event = await waitForLogin(subscription, started.loginId)
    if (!event.success) {
      log.error(`로그인 실패: ${event.error ?? "취소됐거나 만료됐습니다"}`)
      return null
    }
    const status = await subscription.getStatus()
    const email =
      status.account && "email" in status.account ? String(status.account.email ?? "") : ""
    log.success(email ? `연결된 계정: ${email}` : "ChatGPT 구독이 연결됐습니다")
  }

  const loading = spinner()
  loading.start("이 계정에서 쓸 수 있는 모델을 불러오는 중…")
  const models = await subscription.listModels()
  loading.stop(`모델 ${models.length}개 — ${models.map((model) => model.label).join(", ")}`)

  const recommended = models.find((model) => model.id === defaultCodexModel(models))
  const defaults = await confirm({
    message: `${recommended?.label ?? defaultCodexModel(models)} · 추론 ${DEFAULT_EFFORT}로 시작할까요? ${dim("(설정에서 언제든 변경)")}`,
    initialValue: true,
  })
  if (isCancel(defaults)) return null
  if (defaults) {
    return { codexModel: defaultCodexModel(models), codexReasoningEffort: DEFAULT_EFFORT }
  }
  return chooseSubscriptionModel(models)
}
