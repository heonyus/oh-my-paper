import { readWebServerConfig } from "../server/config"
import { readOnboardingState, runOnboarding } from "./onboarding"

async function main(): Promise<void> {
  const config = readWebServerConfig()
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  if (interactive) {
    try {
      const state = await readOnboardingState(config)
      if (!state.configured) {
        await runOnboarding(config, "준비 완료 — 서버를 시작합니다")
      }
    } catch (error) {
      process.stderr.write(
        `설정 확인을 건너뜁니다: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    }
  }
  await import("../server/main")
}

void main()
