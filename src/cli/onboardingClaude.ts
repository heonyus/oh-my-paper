import { spawnSync } from "node:child_process"
import { log } from "@clack/prompts"
import { buildClaudeEnv, findClaudeExecutable } from "../electron/claudeCliEnvironment"
import type { ClaudeSubscriptionAdapter } from "../electron/claudeSubscriptionAdapter"

/** Confirms the local Claude Code login, running the CLI's own interactive login if needed. */
export async function runClaudeOnboarding(claude: ClaudeSubscriptionAdapter): Promise<boolean> {
  const status = await claude.getStatus({ fresh: true })
  const executable = findClaudeExecutable()
  if (!status.available || executable === null) {
    log.error("Claude Code CLI(claude)를 찾지 못했습니다 — 설치한 뒤 다시 실행하세요")
    return false
  }
  if (status.authenticated) {
    const plan = [status.subscriptionType, status.email].filter(Boolean).join(" · ")
    log.success(`Claude 로그인 확인됨${plan ? ` (${plan})` : ""}`)
    return true
  }
  log.step("Claude Code 로그인을 시작합니다 — 브라우저에서 승인하세요")
  spawnSync(executable, ["auth", "login", "--claudeai"], {
    stdio: "inherit",
    env: buildClaudeEnv(),
  })
  const after = await claude.getStatus({ fresh: true })
  if (!after.authenticated) {
    log.error("Claude 로그인이 확인되지 않았습니다 — 앱 설정에서 다시 시도할 수 있습니다")
    return false
  }
  log.success(`Claude 로그인 완료${after.email ? ` (${after.email})` : ""}`)
  return true
}
