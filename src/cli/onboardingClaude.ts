import { spawnSync } from "node:child_process"
import { log } from "@clack/prompts"
import { buildClaudeEnv, findClaudeExecutable } from "../electron/claudeCliEnvironment"
import type { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"
import { t } from "./messages"

/** Confirms the local Claude Code login, running the CLI's own interactive login if needed. */
export async function runClaudeOnboarding(claude: ClaudeSubscriptionAdapter): Promise<boolean> {
  const status = await claude.getStatus({ fresh: true })
  const executable = findClaudeExecutable()
  if (!status.available || executable === null) {
    log.error(t("claude.missing"))
    return false
  }
  if (status.authenticated) {
    const plan = [status.subscriptionType, status.email].filter(Boolean).join(" · ")
    log.success(`${t("claude.signedIn")}${plan ? ` (${plan})` : ""}`)
    return true
  }
  log.step(t("claude.starting"))
  spawnSync(executable, ["auth", "login", "--claudeai"], {
    stdio: "inherit",
    env: buildClaudeEnv(),
  })
  const after = await claude.getStatus({ fresh: true })
  if (!after.authenticated) {
    log.error(t("claude.notConfirmed"))
    return false
  }
  log.success(`${t("claude.done")}${after.email ? ` (${after.email})` : ""}`)
  return true
}
