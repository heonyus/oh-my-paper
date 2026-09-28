// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ClaudeCompletionError, runClaudeCompletion } from "../../src/electron/claudeCliCompletion"
import { ProviderConfigurationError } from "../../src/electron/providerConfigStore"
import { writeFakeClaudeCli } from "../support/fakeClaudeCli"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fakeCli(): Promise<{ readonly cli: string; readonly root: string }> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-claude-cli-"))
  roots.push(root)
  return { cli: await writeFakeClaudeCli(root), root }
}

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

describe("runClaudeCompletion", () => {
  it("streams top-level text deltas and ignores subagent output", async () => {
    const { cli, root } = await fakeCli()
    const deltas: string[] = []

    const text = await runClaudeCompletion(cli, root, {
      systemPrompt: "Be terse.",
      prompt: "Say hello",
      model: "claude-sonnet-5",
      onDelta: (delta) => deltas.push(delta),
    })

    expect(text).toBe("Hello")
    expect(deltas).toEqual(["Hel", "lo"])
  })

  it("sends the image as a content block and runs a tool-less, isolated turn", async () => {
    const { cli, root } = await fakeCli()

    const text = await runClaudeCompletion(cli, root, {
      systemPrompt: "Explain figures.",
      prompt: "What is shown?",
      imageDataUrl: PNG,
      model: "fake-echo",
      effort: "medium",
    })

    const echo: { types: string[]; args: string[] } = JSON.parse(text)
    expect(echo.types).toEqual(["image", "text"])
    expect(echo.args).toEqual(
      expect.arrayContaining(["--tools", "", "--safe-mode", "--no-session-persistence"]),
    )
    expect(echo.args[echo.args.indexOf("--system-prompt") + 1]).toBe("Explain figures.")
    expect(echo.args[echo.args.indexOf("--effort") + 1]).toBe("medium")
  })

  it("rejects malformed image data before starting the CLI", async () => {
    const { cli, root } = await fakeCli()

    await expect(
      runClaudeCompletion(cli, root, {
        systemPrompt: "x",
        prompt: "x",
        imageDataUrl: "data:text/html;base64,PGh0bWw+",
        model: "claude-sonnet-5",
      }),
    ).rejects.toMatchObject({ code: "invalid_image" })
  })

  it("maps a logged-out CLI to an auth configuration error", async () => {
    const { cli, root } = await fakeCli()

    const failure = runClaudeCompletion(cli, root, {
      systemPrompt: "x",
      prompt: "x",
      model: "fake-auth",
    })

    await expect(failure).rejects.toBeInstanceOf(ProviderConfigurationError)
    await expect(failure).rejects.toMatchObject({ kind: "auth" })
  })

  it("reports the CLI's stderr when it exits without a result", async () => {
    const { cli, root } = await fakeCli()

    const failure = runClaudeCompletion(cli, root, {
      systemPrompt: "x",
      prompt: "x",
      model: "fake-crash",
    })

    await expect(failure).rejects.toBeInstanceOf(ClaudeCompletionError)
    await expect(failure).rejects.toThrow("boom from cli")
  })

  it("stops the CLI on cancellation and on timeout", async () => {
    const { cli, root } = await fakeCli()
    const controller = new AbortController()

    const cancelled = runClaudeCompletion(cli, root, {
      systemPrompt: "x",
      prompt: "x",
      model: "fake-hang",
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 100)

    await expect(cancelled).rejects.toMatchObject({ kind: "cancelled" })
    await expect(
      runClaudeCompletion(cli, root, {
        systemPrompt: "x",
        prompt: "x",
        model: "fake-hang",
        timeoutMs: 150,
      }),
    ).rejects.toMatchObject({ kind: "timeout" })
  })
})
