import { describe, expect, it } from "vitest"
import {
  buildClaudeCompletionArgs,
  buildClaudeEnv,
  sanitizeClaudeMessage,
} from "../../src/electron/claudeCliEnvironment"

describe("Claude CLI environment", () => {
  it("passes only login-related variables and never an API key or endpoint override", () => {
    const env = buildClaudeEnv({
      PATH: "/usr/bin",
      HOME: "/Users/reader",
      CLAUDE_CONFIG_DIR: "/Users/reader/.claude",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_BASE_URL: "https://proxy.example.test",
      CLAUDECODE: "1",
    })

    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/Users/reader",
      CLAUDE_CONFIG_DIR: "/Users/reader/.claude",
      DISABLE_AUTOUPDATER: "1",
    })
  })

  it("defaults to the requested model and omits effort for Haiku", () => {
    const sonnet = buildClaudeCompletionArgs({
      model: "claude-sonnet-5",
      effort: "medium",
      systemPrompt: "system",
    })
    const haiku = buildClaudeCompletionArgs({
      model: "claude-haiku-4-5",
      effort: "high",
      systemPrompt: "system",
    })

    expect(sonnet[sonnet.indexOf("--model") + 1]).toBe("claude-sonnet-5")
    expect(sonnet[sonnet.indexOf("--effort") + 1]).toBe("medium")
    expect(haiku).not.toContain("--effort")
  })

  it("turns thinking off with a zero budget and drops the effort level the CLI would refuse", () => {
    const args = buildClaudeCompletionArgs({
      model: "claude-sonnet-5",
      effort: "medium",
      thinking: false,
      systemPrompt: "system",
    })

    expect(args).not.toContain("--effort")
    expect(buildClaudeEnv({ PATH: "/usr/bin" }, { thinking: false })).toMatchObject({
      MAX_THINKING_TOKENS: "0",
    })
    // A budget set in the app's own environment never reaches a turn that thinks.
    expect(buildClaudeEnv({ PATH: "/usr/bin", MAX_THINKING_TOKENS: "0" })).not.toHaveProperty(
      "MAX_THINKING_TOKENS",
    )
  })

  it("keeps turns tool-less unless tools are named", () => {
    const plain = buildClaudeCompletionArgs({ model: "claude-sonnet-5-5", systemPrompt: "system" })
    expect(plain[plain.indexOf("--tools") + 1]).toBe("")
    expect(plain).not.toContain("--allowedTools")
    expect(plain).not.toContain("--max-turns")

    const search = buildClaudeCompletionArgs({
      model: "claude-sonnet-5-5",
      systemPrompt: "system",
      tools: ["WebSearch"],
      maxTurns: 8,
    })
    expect(search[search.indexOf("--tools") + 1]).toBe("WebSearch")
    expect(search[search.indexOf("--allowedTools") + 1]).toBe("WebSearch")
    expect(search[search.indexOf("--max-turns") + 1]).toBe("8")
    expect(search).toContain("--safe-mode")
  })

  it("redacts credentials and control sequences from CLI messages", () => {
    const message = sanitizeClaudeMessage("\u001b[31mfailed sk-ant-abc123 Bearer xyz.789\u001b[0m")

    expect(message).toBe("failed [redacted] Bearer [redacted]")
  })
})
