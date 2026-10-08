import { describe, expect, it } from "vitest"
import {
  CLAUDE_MODEL_OPTIONS,
  claudeModelChoices,
  DEFAULT_CLAUDE_MODEL,
} from "../../src/shared/claudeTypes"

describe("Claude model choices", () => {
  it("offers Haiku 5.5 first as the default", () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe("claude-haiku-5-5")
    expect(CLAUDE_MODEL_OPTIONS[0]?.id).toBe(DEFAULT_CLAUDE_MODEL)
    const choices = claudeModelChoices(DEFAULT_CLAUDE_MODEL)
    expect(choices.map((choice) => choice.id)).toEqual(
      CLAUDE_MODEL_OPTIONS.map((option) => option.id),
    )
    expect(choices[0]).toEqual({ id: DEFAULT_CLAUDE_MODEL, label: "Claude Haiku 5.5 (기본)" })
    expect(choices[1]).toEqual(CLAUDE_MODEL_OPTIONS[1])
    expect(claudeModelChoices(DEFAULT_CLAUDE_MODEL, "en")[0]?.label).toBe(
      "Claude Haiku 5.5 (default)",
    )
  })

  it("keeps a saved model that is no longer listed", () => {
    const choices = claudeModelChoices("claude-sonnet-4-6")

    expect(choices).toHaveLength(CLAUDE_MODEL_OPTIONS.length + 1)
    expect(choices.at(-1)).toEqual({
      id: "claude-sonnet-4-6",
      label: "claude-sonnet-4-6 (저장된 모델)",
    })
  })
})
