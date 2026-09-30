import { confirm, isCancel, log, note, select, spinner } from "@clack/prompts"
import type { CodexSubscriptionAdapter } from "../electron/codexSubscriptionAdapter"
import {
  type CodexLoginCompletedEvent,
  type CodexLoginStartResult,
  type CodexModel,
  codexModelHint,
  codexReasoningEffortOptions,
  defaultCodexModel,
} from "../shared/codexTypes"
import { type CodexReasoningEffort, codexReasoningEffortSchema } from "../shared/ipc"
import { cliLocale } from "./locale"
import { t } from "./messages"
import { openBrowser } from "./openBrowser"
import { bold, dim, link } from "./style"

const DEFAULT_EFFORT: CodexReasoningEffort = "medium"

async function waitForLogin(
  subscription: CodexSubscriptionAdapter,
  loginId: string,
): Promise<CodexLoginCompletedEvent> {
  const wait = spinner()
  wait.start(t("chatgpt.waiting"))
  try {
    return await new Promise<CodexLoginCompletedEvent>((resolve) => {
      const unsubscribe = subscription.onLoginCompleted((event) => {
        if (event.loginId && event.loginId !== loginId) return
        unsubscribe()
        resolve(event)
      })
    })
  } finally {
    wait.stop(t("chatgpt.received"))
  }
}

async function chooseSubscriptionModel(models: readonly CodexModel[]): Promise<{
  codexModel: string
  codexReasoningEffort: CodexReasoningEffort
} | null> {
  const codexModel = await select({
    message: t("chatgpt.pickModel"),
    options: models.map((option) => {
      const hint = codexModelHint(option.id, cliLocale()) ?? option.description
      return { value: option.id, label: option.label, ...(hint ? { hint } : {}) }
    }),
    initialValue: defaultCodexModel(models),
  })
  if (isCancel(codexModel)) return null

  const effortOptions = codexReasoningEffortOptions(codexModel, models)
  const effort = await select({
    message: t("chatgpt.pickEffort"),
    options: effortOptions.map((option) => ({
      value: option.id,
      label: option.label[cliLocale()],
    })),
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
    note(t("chatgpt.noCodex"), t("chatgpt.noCodexTitle"))
    return null
  }

  const checking = spinner()
  checking.start(t("chatgpt.checking"))
  const current = await subscription.getStatus()
  const currentEmail =
    current.account && "email" in current.account ? String(current.account.email ?? "") : ""
  checking.stop(
    current.authenticated
      ? currentEmail
        ? t("chatgpt.signedInAs", { email: currentEmail })
        : t("chatgpt.signedIn")
      : t("chatgpt.needsSignIn"),
  )

  if (!current.authenticated) {
    const method = await select({
      message: t("chatgpt.method"),
      options: [
        {
          value: "chatgpt",
          label: t("chatgpt.browser"),
          hint: t("chatgpt.browserHint"),
        },
        {
          value: "chatgptDeviceCode",
          label: t("chatgpt.device"),
          hint: t("chatgpt.deviceHint"),
        },
      ],
    })
    if (isCancel(method)) return null

    let started: CodexLoginStartResult
    try {
      started = await subscription.startLogin(method)
    } catch (error) {
      log.error(error instanceof Error ? error.message : t("chatgpt.startFailed"))
      return null
    }

    if (started.type === "chatgpt") {
      openBrowser(started.authUrl)
      note(
        t("chatgpt.browserSteps", {
          approve: bold(t("chatgpt.approve")),
          url: link(started.authUrl),
        }),
        t("chatgpt.signInTitle"),
      )
    } else if (started.type === "chatgptDeviceCode") {
      note(
        t("chatgpt.deviceSteps", {
          url: link(started.verificationUrl),
          code: bold(started.userCode),
        }),
        t("chatgpt.deviceTitle"),
      )
    } else {
      log.error(t("chatgpt.unsupported"))
      return null
    }

    const event = await waitForLogin(subscription, started.loginId)
    if (!event.success) {
      log.error(t("chatgpt.failed", { reason: event.error ?? t("chatgpt.cancelledOrExpired") }))
      return null
    }
    const status = await subscription.getStatus()
    const email =
      status.account && "email" in status.account ? String(status.account.email ?? "") : ""
    log.success(email ? t("chatgpt.account", { email }) : t("chatgpt.connected"))
  }

  const loading = spinner()
  loading.start(t("chatgpt.loadingModels"))
  const models = await subscription.listModels()
  loading.stop(
    t("chatgpt.models", {
      count: models.length,
      labels: models.map((model) => model.label).join(", "),
    }),
  )

  const recommended = models.find((model) => model.id === defaultCodexModel(models))
  const defaults = await confirm({
    message: `${t("chatgpt.startWith", { model: recommended?.label ?? defaultCodexModel(models), effort: DEFAULT_EFFORT })} ${dim(t("chatgpt.changeLater"))}`,
    initialValue: true,
  })
  if (isCancel(defaults)) return null
  if (defaults) {
    return { codexModel: defaultCodexModel(models), codexReasoningEffort: DEFAULT_EFFORT }
  }
  return chooseSubscriptionModel(models)
}
