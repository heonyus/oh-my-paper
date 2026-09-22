import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CodexAppServerClient } from "../../src/electron/codexAppServerClient"
import { probeCodexRuntime } from "../../src/electron/codexProbe"
import { CodexSession } from "../../src/electron/codexSession"
import { findCodexExecutable } from "../../src/electron/codexSubprocess"
import { CodexSubscriptionAdapter } from "../../src/electron/codexSubscriptionAdapter"

const roots: string[] = []

function allowAuthenticated(adapter: CodexSubscriptionAdapter): void {
  vi.spyOn(adapter, "assertAuthenticated").mockResolvedValue(undefined)
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })))
})

describe("CodexSubscriptionAdapter", () => {
  it("reports not available when codex executable is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)
    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: "/nonexistent/path/to/codex",
    })

    expect(adapter.isAvailable).toBe(false)
    const status = await adapter.getStatus()
    expect(status.available).toBe(false)
    expect(status.authenticated).toBe(false)
    expect(status.error).toContain("Codex executable not found")
  })

  it("reads official authenticated shape with requiresOpenaiAuth: true", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    vi.spyOn(CodexAppServerClient.prototype, "readAccount").mockResolvedValue({
      account: {
        type: "chatgpt",
        email: "user@example.com",
        planType: "pro",
      },
      requiresOpenaiAuth: true,
    })

    vi.spyOn(CodexAppServerClient.prototype, "readRateLimits").mockResolvedValue({
      rateLimits: {
        limitId: "codex",
        planType: "pro",
        primary: {
          usedPercent: 25,
          resetsAt: 1788600000,
          windowDurationMins: 300,
        },
      },
    })

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })

    const status = await adapter.getStatus()
    expect(status.available).toBe(true)
    expect(status.authenticated).toBe(true)
    expect(status.requiresOpenaiAuth).toBe(true)
    expect(status.account).toEqual({
      type: "chatgpt",
      email: "user@example.com",
      planType: "pro",
    })
    expect(status.rateLimits?.rateLimits.primary?.usedPercent).toBe(25)
  })

  it("tolerates null email and new official plan enums safely", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    vi.spyOn(CodexAppServerClient.prototype, "readAccount").mockResolvedValue({
      account: {
        type: "chatgpt",
        email: null,
        planType: "enterprise_2027",
      },
      requiresOpenaiAuth: true,
    })

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })

    const status = await adapter.getStatus()
    expect(status.authenticated).toBe(true)
    const account = status.account
    expect(account?.type).toBe("chatgpt")
    if (account?.type !== "chatgpt") throw new Error("expected ChatGPT account")
    expect(account.email).toBeNull()
    expect(account.planType).toBe("enterprise_2027")
  })

  it("stops the idle process without disposing persistent login listeners", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    const disposeSpy = vi.spyOn(CodexAppServerClient.prototype, "dispose")
    const stopSpy = vi.spyOn(CodexAppServerClient.prototype, "stop")
    vi.spyOn(CodexAppServerClient.prototype, "readAccount").mockResolvedValue({
      account: null,
      requiresOpenaiAuth: true,
    })

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })

    const status = await adapter.getStatus()
    expect(status.authenticated).toBe(false)
    expect(stopSpy).toHaveBeenCalled()
    expect(disposeSpy).not.toHaveBeenCalled()
  })

  it("strictly rejects non-chatgpt login types", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })

    await expect(adapter.startLogin("apiKey")).rejects.toThrow()
  })

  it("starts login and initiates OAuth url flow for chatgpt only", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    vi.spyOn(CodexAppServerClient.prototype, "startLogin").mockResolvedValue({
      type: "chatgpt",
      loginId: "login-123",
      authUrl: "https://chatgpt.com/auth/oauth/start?loginId=login-123",
    })

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })

    const res = await adapter.startLogin("chatgpt")
    expect(res).toEqual({
      type: "chatgpt",
      loginId: "login-123",
      authUrl: "https://chatgpt.com/auth/oauth/start?loginId=login-123",
    })
  })

  it("supports cancellation and logout", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    const cancelSpy = vi
      .spyOn(CodexAppServerClient.prototype, "cancelLogin")
      .mockResolvedValue(undefined)
    const logoutSpy = vi
      .spyOn(CodexAppServerClient.prototype, "logout")
      .mockResolvedValue(undefined)

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })

    await adapter.cancelLogin("login-123")
    expect(cancelSpy).toHaveBeenCalledWith("login-123")

    await adapter.logout()
    expect(logoutSpy).toHaveBeenCalled()
  })

  it("isolates thread context per concurrent completion", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    vi.spyOn(CodexAppServerClient.prototype, "ensureStarted").mockResolvedValue(undefined)

    let threadCount = 0
    vi.spyOn(CodexSession.prototype, "startThread").mockImplementation(async () => {
      threadCount++
      return `thread-${threadCount}`
    })

    vi.spyOn(CodexSession.prototype, "startTurn").mockImplementation(async (params) => {
      return `turn-for-${params.threadId}`
    })

    const deltaCallbacks = new Set<
      (notif: { threadId: string; turnId: string; delta: string }) => void
    >()
    const completedCallbacks = new Set<
      (notif: { threadId: string; turn: { id: string; status: "completed" } }) => void
    >()

    vi.spyOn(CodexAppServerClient.prototype, "onDelta").mockImplementation((cb) => {
      deltaCallbacks.add(cb)
      return () => deltaCallbacks.delete(cb)
    })
    vi.spyOn(CodexAppServerClient.prototype, "onTurnCompleted").mockImplementation((cb) => {
      completedCallbacks.add(cb)
      return () => completedCallbacks.delete(cb)
    })

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    allowAuthenticated(adapter)

    const completion1 = adapter.runCompletion({ prompt: "Page 1" })
    const completion2 = adapter.runCompletion({ prompt: "Page 2" })

    await vi.waitFor(() => {
      expect(threadCount).toBe(2)
    })

    for (const cb of deltaCallbacks) {
      cb({ threadId: "thread-1", turnId: "turn-for-thread-1", delta: "Translation 1" })
      cb({ threadId: "thread-2", turnId: "turn-for-thread-2", delta: "Translation 2" })
    }
    for (const cb of completedCallbacks) {
      cb({ threadId: "thread-1", turn: { id: "turn-for-thread-1", status: "completed" } })
      cb({ threadId: "thread-2", turn: { id: "turn-for-thread-2", status: "completed" } })
    }

    const [res1, res2] = await Promise.all([completion1, completion2])
    expect(res1).toBe("Translation 1")
    expect(res2).toBe("Translation 2")
  })

  it("handles early notifications arriving before startTurn completes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    vi.spyOn(CodexAppServerClient.prototype, "ensureStarted").mockResolvedValue(undefined)
    vi.spyOn(CodexSession.prototype, "startThread").mockResolvedValue("thread-early")

    let deltaCb: ((notif: { threadId: string; turnId: string; delta: string }) => void) | null =
      null
    let completedCb:
      | ((notif: { threadId: string; turn: { id: string; status: "completed" } }) => void)
      | null = null

    vi.spyOn(CodexAppServerClient.prototype, "onDelta").mockImplementation((cb) => {
      deltaCb = cb
      return () => {}
    })
    vi.spyOn(CodexAppServerClient.prototype, "onTurnCompleted").mockImplementation((cb) => {
      completedCb = cb
      return () => {}
    })

    // startTurn delays its resolve, but early events fire in between
    vi.spyOn(CodexSession.prototype, "startTurn").mockImplementation(async () => {
      if (deltaCb && completedCb) {
        deltaCb({ threadId: "thread-early", turnId: "early-turn", delta: "Early content" })
        completedCb({ threadId: "thread-early", turn: { id: "early-turn", status: "completed" } })
      }
      return "early-turn"
    })

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    allowAuthenticated(adapter)

    const res = await adapter.runCompletion({ prompt: "Test" })
    expect(res).toBe("Early content")
  })

  it("handles abort signal before starting turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    allowAuthenticated(adapter)

    const controller = new AbortController()
    controller.abort()

    await expect(
      adapter.runCompletion({ prompt: "Aborted", signal: controller.signal }),
    ).rejects.toThrow("Completion aborted")
  })

  it("handles completion timeout correctly", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)

    vi.spyOn(CodexSession.prototype, "startThread").mockResolvedValue("thread-timeout")
    vi.spyOn(CodexSession.prototype, "startTurn").mockResolvedValue("turn-timeout")
    vi.spyOn(CodexAppServerClient.prototype, "onDelta").mockReturnValue(() => {})
    vi.spyOn(CodexAppServerClient.prototype, "onTurnCompleted").mockReturnValue(() => {})
    vi.spyOn(CodexAppServerClient.prototype, "onExit").mockReturnValue(() => {})

    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    allowAuthenticated(adapter)

    await expect(adapter.runCompletion({ prompt: "Timeout", timeoutMs: 50 })).rejects.toThrow(
      "Completion timed out after 50ms",
    )
  })

  it("rejects completion before dispatch when the subscription is unauthenticated", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-codex-test-"))
    roots.push(root)
    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    vi.spyOn(adapter, "getStatus").mockResolvedValue({
      available: true,
      authenticated: false,
      account: null,
      requiresOpenaiAuth: true,
    })
    const startThread = vi.spyOn(CodexSession.prototype, "startThread")

    await expect(adapter.runCompletion({ prompt: "Must not dispatch" })).rejects.toMatchObject({
      name: "ProviderConfigurationError",
      kind: "auth",
    })
    expect(startThread).not.toHaveBeenCalled()
  })

  it("disposable probe succeeds against installed codex runtime without inference or login", async () => {
    const exe = findCodexExecutable()
    if (!exe) return // skip if codex cli not installed in this environment

    const probeResult = await probeCodexRuntime()
    expect(probeResult.available).toBe(true)
    expect(probeResult.probeSucceeded).toBe(true)
    expect(probeResult.error).toBeUndefined()
    expect(probeResult.authenticated).toBe(false)
    expect(probeResult.account).toBeNull()
    expect(probeResult.requiresOpenaiAuth).toBe(true)
    expect(probeResult.configOrigins).toEqual(["redacted"])
    expect(probeResult.configSafety).toEqual({
      hasLayerMetadata: true,
      credentialsStoreIsFile: false,
      forcedLoginIsChatgpt: true,
      shellToolDisabled: true,
      unifiedExecDisabled: true,
      multiAgentDisabled: true,
      pluginsDisabled: true,
      appsDisabled: true,
      webSearchDisabled: true,
      mcpServersEmpty: true,
    })
  })

  it("reports a recognizable failure when the disposable executable is missing", async () => {
    const result = await probeCodexRuntime({ executablePath: "/nonexistent/codex" })

    expect(result.probeSucceeded).toBe(false)
    expect(result.error).toBe("Codex executable not found")
    expect(result.authenticated).toBe(false)
    expect(result.account).toBeNull()
  })
})
