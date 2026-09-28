import { execFile } from "node:child_process"
import { confirm, isCancel, log, note, select, spinner } from "@clack/prompts"
import type { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import {
  CODEX_MODEL_OPTIONS,
  type CodexLoginCompletedEvent,
  type CodexLoginStartResult,
  codexReasoningEffortOptions,
} from "../shared/codexTypes"
import { type CodexReasoningEffort, codexReasoningEffortSchema } from "../shared/ipc"

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
  wait.start("브라우저에서 로그인을 완료하세요…")
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

async function chooseSubscriptionModel(): Promise<{
  codexModel: string
  codexReasoningEffort: CodexReasoningEffort
} | null> {
  const codexModel = await select({
    message: "구독 모델을 선택하세요",
    options: CODEX_MODEL_OPTIONS.map((option) => ({
      value: option.id,
      label: option.label,
    })),
    initialValue: "gpt-5.6-sol",
  })
  if (isCancel(codexModel)) return null

  const effortOptions = codexReasoningEffortOptions(codexModel)
  const effort = await select({
    message: "추론 수준(Thinking)을 선택하세요",
    options: effortOptions.map((option) => ({ value: option.id, label: option.label })),
    initialValue: "medium",
  })
  if (isCancel(effort)) return null

  return { codexModel, codexReasoningEffort: codexReasoningEffortSchema.parse(effort) }
}

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

  const method = await select({
    message: "OpenAI 로그인 방식",
    options: [
      { value: "chatgpt", label: "브라우저로 ChatGPT 로그인", hint: "권장" },
      {
        value: "chatgptDeviceCode",
        label: "기기 코드로 로그인",
        hint: "다른 기기의 브라우저 사용",
      },
    ],
  })
  if (isCancel(method)) return null

  const preparing = spinner()
  preparing.start("Codex 로그인을 준비하는 중…")
  let started: CodexLoginStartResult
  try {
    started = await subscription.startLogin(method)
  } catch (error) {
    preparing.stop("로그인 준비 실패")
    log.error(error instanceof Error ? error.message : "로그인을 시작하지 못했습니다")
    return null
  }
  preparing.stop("로그인 준비 완료")

  if (started.type === "chatgpt") {
    openBrowser(started.authUrl)
    note(`브라우저가 열리지 않으면 이 주소를 여세요:\n${started.authUrl}`, "ChatGPT 로그인")
  } else if (started.type === "chatgptDeviceCode") {
    note(
      `코드: ${started.userCode}\n\n아래 주소에서 코드를 입력하세요:\n${started.verificationUrl}`,
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
  note(email ? `연결된 계정: ${email}` : "ChatGPT 구독이 연결됐습니다", "로그인 완료")

  const defaults = await confirm({
    message: "모델 gpt-5.6-sol · 추론 medium으로 시작할까요? (설정에서 변경 가능)",
    initialValue: true,
  })
  if (isCancel(defaults)) return null
  if (defaults) return { codexModel: "gpt-5.6-sol", codexReasoningEffort: "medium" }
  return chooseSubscriptionModel()
}
