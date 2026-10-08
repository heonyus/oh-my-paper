import { describe, expect, it, vi } from "vitest"
import type { AiModeSettings } from "../../src/electron/aiModeStore"
import type { ClaudeSubscriptionAdapter } from "../../src/electron/claudeSubscriptionAdapter"
import type { CodexSubscriptionAdapter } from "../../src/electron/codexSubscriptionAdapter"
import { codexEffortFor, runWithClaude, runWithCodex } from "../../src/server/subscriptionAi"
import type { AiRequest } from "../../src/shared/ipc"

const settings = {
  claudeModel: "claude-haiku-5-5",
  claudeEffort: "medium",
  codexModel: "gpt-6-luna",
  codexReasoningEffort: "medium",
} as unknown as AiModeSettings

function request(action: AiRequest["action"]): AiRequest {
  return {
    action,
    documentId: "0123456789abcdef",
    page: 1,
    quote: "The whole paper supplied in PAPER_CONTEXT.",
    paperContext: "문서 유형: 논문.",
    before: "",
    after: "",
  } as AiRequest
}

describe("subscription effort per action", () => {
  it("answers reading tools without thinking and keeps it for conversations", async () => {
    const runCompletion = vi.fn(async () => "답변")
    const claude = { runCompletion } as unknown as ClaudeSubscriptionAdapter

    for (const action of [
      "keywords",
      "three_line_summary",
      "paper_summary",
      "translation",
    ] as const)
      await runWithClaude(claude, settings, request(action))
    await runWithClaude(claude, settings, request("chat"))

    const thinking = runCompletion.mock.calls.map(
      (call) => (call as unknown as [{ thinking?: boolean }])[0].thinking,
    )
    expect(thinking).toEqual([false, false, false, false, true])
  })

  it("runs ChatGPT's reading tools at low effort unless less was chosen", async () => {
    const runCompletion = vi.fn(async () => "답변")
    const codex = { runCompletion } as unknown as CodexSubscriptionAdapter

    await runWithCodex(codex, settings, request("keywords"))
    await runWithCodex(codex, settings, request("chat"))

    const efforts = runCompletion.mock.calls.map(
      (call) => (call as unknown as [{ reasoningEffort?: string }])[0].reasoningEffort,
    )
    expect(efforts).toEqual(["low", "medium"])
    expect(codexEffortFor("paper_summary", "minimal")).toBe("minimal")
    expect(codexEffortFor("paper_summary", undefined)).toBe("low")
  })
})
