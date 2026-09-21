// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AiModeStore } from "../../src/electron/aiModeStore"
import type { CodexSubscriptionAdapter } from "../../src/electron/codexSubscriptionAdapter"
import { ProviderConfigurationError } from "../../src/electron/providerConfigStore"
import type { ProviderService } from "../../src/electron/providerService"
import {
  type ProviderIpcEvent,
  type ProviderIpcMain,
  registerProviderIpc,
} from "../../src/electron/registerProviderIpc"
import { aiJobStartRequestSchema } from "../../src/shared/aiIpc"
import { codexAccountStatusSchema } from "../../src/shared/codexTypes"
import { providerStatusSchema } from "../../src/shared/ipc"
import { ipcChannels } from "../../src/shared/ipcChannels"

type Handler = (event: ProviderIpcEvent, value: unknown) => Promise<unknown> | unknown

class FakeIpc implements ProviderIpcMain {
  readonly handlers = new Map<string, Handler>()
  readonly messages: unknown[] = []
  readonly sender = {
    isDestroyed: () => false,
    send: (_channel: string, value: unknown) => {
      this.messages.push(value)
    },
  } satisfies ProviderIpcEvent["sender"]

  handle(channel: string, listener: Handler): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  async invoke(channel: string, value: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (handler === undefined) throw new Error(`Missing handler: ${channel}`)
    return await handler({ sender: this.sender }, value)
  }
}

const request = aiJobStartRequestSchema.parse({
  jobId: "job:provider-security",
  role: "reader",
  documentId: "0123456789abcdef",
  sourceGeneration: 0,
  priority: "current",
  pool: "remote_text",
  request: {
    action: "three_line_summary",
    documentId: "0123456789abcdef",
    page: 1,
    quote: "Synthetic quote",
    before: "",
    after: "",
  },
})

function provider(): Pick<
  ProviderService,
  "saveKey" | "saveConfig" | "status" | "run" | "runStream"
> {
  return {
    saveKey: async () => undefined,
    saveConfig: async () => undefined,
    status: async () =>
      providerStatusSchema.parse({
        configured: false,
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
      }),
    run: async () => ({ text: "unused", model: "unused" }),
    runStream: async () => ({ text: "unused", model: "unused" }),
  }
}

function unauthenticatedStatus() {
  return codexAccountStatusSchema.parse({
    available: true,
    authenticated: false,
    account: null,
    requiresOpenaiAuth: true,
  })
}

function modes(): Pick<AiModeStore, "load" | "save" | "loadSettings"> {
  return {
    load: async () => "chatgpt",
    loadSettings: async () => ({
      mode: "chatgpt",
      codexModel: "gpt-5.6-sol",
      codexReasoningEffort: "medium",
    }),
    save: async () => undefined,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("provider IPC authentication boundary", () => {
  it("rejects unauthenticated job start before registering the job", async () => {
    const ipc = new FakeIpc()
    const assertAuthenticated = vi.fn(async () => {
      throw new ProviderConfigurationError("auth")
    })
    const runCompletion = vi.fn(async () => "must not run")
    const codex = {
      getStatus: async () => unauthenticatedStatus(),
      assertAuthenticated,
      runCompletion,
    } satisfies Pick<
      CodexSubscriptionAdapter,
      "getStatus" | "assertAuthenticated" | "runCompletion"
    >
    const registration = registerProviderIpc(provider(), codex, modes(), ipc)

    await expect(ipc.invoke(ipcChannels.aiJobStart, request)).rejects.toMatchObject({
      name: "ProviderConfigurationError",
      kind: "auth",
    })
    expect(assertAuthenticated).toHaveBeenCalledTimes(1)
    expect(runCompletion).not.toHaveBeenCalled()

    registration.dispose()
  })

  it("rechecks authentication at asynchronous dispatch after the preflight", async () => {
    const ipc = new FakeIpc()
    let guardCalls = 0
    const assertAuthenticated = vi.fn(async () => {
      guardCalls += 1
      if (guardCalls === 2) throw new ProviderConfigurationError("auth")
    })
    const runCompletion = vi.fn(async () => "must not run")
    const codex = {
      getStatus: async () => unauthenticatedStatus(),
      assertAuthenticated,
      runCompletion,
    } satisfies Pick<
      CodexSubscriptionAdapter,
      "getStatus" | "assertAuthenticated" | "runCompletion"
    >
    const registration = registerProviderIpc(provider(), codex, modes(), ipc)

    await expect(ipc.invoke(ipcChannels.aiJobStart, request)).resolves.toEqual({
      jobId: request.jobId,
    })
    await vi.waitFor(() => expect(assertAuthenticated).toHaveBeenCalledTimes(2))
    expect(runCompletion).not.toHaveBeenCalled()
    expect(ipc.messages).toContainEqual(expect.objectContaining({ kind: "failed", code: "auth" }))

    registration.dispose()
  })
})
