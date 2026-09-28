// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ClaudeSubscriptionAdapter } from "../../src/electron/claudeSubscriptionAdapter"
import { writeFakeClaudeCli } from "../support/fakeClaudeCli"

const adapters: ClaudeSubscriptionAdapter[] = []
const roots: string[] = []
afterEach(async () => {
  for (const adapter of adapters.splice(0)) adapter.dispose()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function adapterFor(
  loggedIn: boolean,
  maxConcurrency?: number,
): Promise<ClaudeSubscriptionAdapter> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-claude-adapter-"))
  roots.push(root)
  const adapter = new ClaudeSubscriptionAdapter({
    appRoot: root,
    executablePath: await writeFakeClaudeCli(root, { loggedIn }),
    maxConcurrency,
  })
  adapters.push(adapter)
  return adapter
}

// The fake CLI is a POSIX shebang script, and Claude subscription mode targets macOS.
const onWindows = process.platform === "win32"

describe("ClaudeSubscriptionAdapter", () => {
  it.skipIf(onWindows)("reports the CLI login and runs a completion with it", async () => {
    const adapter = await adapterFor(true)

    await expect(adapter.getStatus()).resolves.toMatchObject({
      available: true,
      authenticated: true,
      email: "reader@example.test",
      subscriptionType: "max",
      loginPending: false,
    })
    await expect(
      adapter.runCompletion({ systemPrompt: "x", prompt: "hi", model: "claude-sonnet-5" }),
    ).resolves.toBe("Hello")
  })

  it.skipIf(onWindows)("refuses to run when the CLI is logged out", async () => {
    const adapter = await adapterFor(false)

    await expect(
      adapter.runCompletion({ systemPrompt: "x", prompt: "hi", model: "claude-sonnet-5" }),
    ).rejects.toMatchObject({ kind: "auth" })
  })

  it("reports a missing CLI instead of guessing a path", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-claude-adapter-"))
    roots.push(root)
    const adapter = new ClaudeSubscriptionAdapter({
      appRoot: root,
      executablePath: join(root, "missing-claude"),
    })

    await expect(adapter.getStatus()).resolves.toMatchObject({
      available: false,
      authenticated: false,
    })
  })

  it.skipIf(onWindows)(
    "bounds concurrent CLI runs and lets a queued request be cancelled",
    async () => {
      const adapter = await adapterFor(true, 1)
      const first = new AbortController()
      const queued = new AbortController()
      const running = adapter.runCompletion({
        systemPrompt: "x",
        prompt: "hi",
        model: "fake-hang",
        signal: first.signal,
      })
      await new Promise((resolve) => setTimeout(resolve, 200))

      const waiting = adapter.runCompletion({
        systemPrompt: "x",
        prompt: "hi",
        model: "claude-sonnet-5",
        signal: queued.signal,
      })
      queued.abort()
      await expect(waiting).rejects.toMatchObject({ kind: "cancelled" })

      first.abort()
      await expect(running).rejects.toMatchObject({ kind: "cancelled" })
      await expect(
        adapter.runCompletion({ systemPrompt: "x", prompt: "hi", model: "claude-sonnet-5" }),
      ).resolves.toBe("Hello")
    },
  )
})
