import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { CodexAppServerClient } from "../../src/electron/codexAppServerClient"
import { CodexSession } from "../../src/electron/codexSession"
import { CodexSubprocess } from "../../src/electron/codexSubprocess"
import { codexRpcRequestSchema } from "../../src/shared/codexProtocol"

class FakeSubprocess extends EventEmitter {
  isRunning = false
  writtenLines: string[] = []
  #lineCb: ((line: string) => void) | null = null

  async start(): Promise<void> {
    this.isRunning = true
  }

  stop(): void {
    this.isRunning = false
  }

  writeLine(line: string): void {
    this.writtenLines.push(line)
    try {
      const parsed: unknown = JSON.parse(line)
      const req = codexRpcRequestSchema.safeParse(parsed)
      if (req.success && req.data.method === "initialize") {
        const id = req.data.id
        setTimeout(() => {
          this.emitLine({ id, result: { userAgent: "Codex/1.0" } })
        }, 0)
      }
    } catch {
      // ignore
    }
  }

  onLine(cb: (line: string) => void): void {
    this.#lineCb = cb
  }

  onError(cb: (err: Error) => void): void {
    this.on("error", cb)
  }

  onExit(cb: (code: number | null) => void): void {
    this.on("exit", cb)
  }

  emitLine(obj: unknown): void {
    if (this.#lineCb) {
      this.#lineCb(JSON.stringify(obj))
    }
  }

  emitRaw(raw: string): void {
    if (this.#lineCb) {
      this.#lineCb(raw)
    }
  }
}

function hasRequest(fake: FakeSubprocess, method: string): boolean {
  return fake.writtenLines.some((line) => {
    try {
      const parsed: unknown = JSON.parse(line)
      const request = codexRpcRequestSchema.safeParse(parsed)
      return request.success && request.data.method === method
    } catch (error) {
      if (error instanceof SyntaxError) return false
      throw error
    }
  })
}

function findRequest(fake: FakeSubprocess, method: string) {
  for (const line of fake.writtenLines) {
    const parsed: unknown = JSON.parse(line)
    const request = codexRpcRequestSchema.safeParse(parsed)
    if (request.success && request.data.method === method) return request.data
  }
  throw new Error(`request not found: ${method}`)
}

describe("CodexAppServerClient Protocol Fake", () => {
  let fake: FakeSubprocess
  let client: CodexAppServerClient

  beforeEach(() => {
    fake = new FakeSubprocess()
    vi.spyOn(CodexSubprocess.prototype, "start").mockImplementation(async () => {
      fake.isRunning = true
    })
    vi.spyOn(CodexSubprocess.prototype, "isRunning", "get").mockImplementation(() => fake.isRunning)
    vi.spyOn(CodexSubprocess.prototype, "onLine").mockImplementation((cb) => {
      fake.onLine(cb)
    })
    vi.spyOn(CodexSubprocess.prototype, "onError").mockImplementation((cb) => {
      fake.onError(cb)
    })
    vi.spyOn(CodexSubprocess.prototype, "onExit").mockImplementation((cb) => {
      fake.onExit(cb)
    })
    vi.spyOn(CodexSubprocess.prototype, "writeLine").mockImplementation((line) => {
      fake.writeLine(line)
    })
    vi.spyOn(CodexSubprocess.prototype, "stop").mockImplementation(() => {
      fake.stop()
    })

    client = new CodexAppServerClient({
      codexHome: "/tmp/codex-home",
      workdir: "/tmp/codex-work",
    })
  })

  afterEach(() => {
    client.dispose()
    vi.restoreAllMocks()
  })

  it("initializes upon first request and handles typed json-rpc response", async () => {
    const schema = z.object({ status: z.string() })
    const reqPromise = client.request("test/method", { foo: "bar" }, schema)

    await vi.waitFor(() => expect(hasRequest(fake, "test/method")).toBe(true))

    const methodMsg = findRequest(fake, "test/method")
    fake.emitLine({ id: methodMsg.id, result: { status: "ok" } })

    const res = await reqPromise
    expect(res).toEqual({ status: "ok" })
  })

  it("sanitizes sensitive data in error responses", async () => {
    const reqPromise = client.request("test/fail", {}, z.unknown())

    await vi.waitFor(() => expect(hasRequest(fake, "test/fail")).toBe(true))

    const reqMsg = findRequest(fake, "test/fail")
    fake.emitLine({
      id: reqMsg.id,
      error: {
        code: -32600,
        message: "Error with key sk-1234567890abcdef and authUrl=https://auth",
      },
    })

    await expect(reqPromise).rejects.toThrow("[REDACTED_KEY]")
    await expect(reqPromise).rejects.toThrow("authUrl=[REDACTED]")
  })

  it("tolerates malformed JSON without crashing", async () => {
    const reqPromise = client.request("test/ping", {}, z.string())

    await vi.waitFor(() => expect(hasRequest(fake, "test/ping")).toBe(true))

    const reqMsg = findRequest(fake, "test/ping")

    fake.emitRaw("INVALID JSON{}}")
    fake.emitRaw("")
    fake.emitRaw("null")

    fake.emitLine({ id: reqMsg.id, result: "pong" })

    const res = await reqPromise
    expect(res).toBe("pong")
  })

  it("auto-denies server approval requests for sandbox safety", async () => {
    await client.ensureStarted()

    fake.emitLine({
      id: "srv-req-1",
      method: "item/commandExecution/requestApproval",
      params: { command: "rm -rf /" },
    })

    fake.emitLine({
      id: "srv-req-2",
      method: "item/permissions/requestApproval",
      params: {},
    })

    await vi.waitFor(() => {
      const denialMsg1 = fake.writtenLines.find((l) => l.includes('"srv-req-1"'))
      const denialMsg2 = fake.writtenLines.find((l) => l.includes('"srv-req-2"'))
      expect(denialMsg1).toBeDefined()
      expect(denialMsg2).toBeDefined()
      if (!denialMsg1 || !denialMsg2) throw new Error("denials missing")
      expect(JSON.parse(denialMsg1)).toEqual({
        id: "srv-req-1",
        result: { decision: "decline" },
      })
      expect(JSON.parse(denialMsg2)).toEqual({
        id: "srv-req-2",
        result: { permissions: { fileSystem: { entries: [] }, network: { enabled: false } } },
      })
    })
  })

  it("supports listener unsubscription without leaks", async () => {
    const deltas: string[] = []
    const unsub = client.onDelta((d) => deltas.push(d.delta))

    fake.emitLine({
      method: "item/agentMessage/delta",
      params: { threadId: "t1", turnId: "turn1", delta: "first" },
    })
    expect(deltas).toEqual(["first"])

    unsub()
    fake.emitLine({
      method: "item/agentMessage/delta",
      params: { threadId: "t1", turnId: "turn1", delta: "second" },
    })
    expect(deltas).toEqual(["first"])
  })

  it("preserves login notifications across an idle process stop", async () => {
    const listener = vi.fn()
    client.onLoginCompleted(listener)
    await client.ensureStarted()
    client.stop()
    await client.ensureStarted()
    fake.emitLine({
      method: "account/login/completed",
      params: { loginId: "test-login", success: true },
    })
    expect(listener).toHaveBeenCalledWith({ loginId: "test-login", success: true })
  })

  it("passes selected image input without enabling filesystem tools", async () => {
    const session = new CodexSession(client)
    const pending = session.startTurn({
      threadId: "t1",
      prompt: "Explain the selected figure",
      imageDataUrl: "data:image/png;base64,AA==",
    })
    await vi.waitFor(() => expect(hasRequest(fake, "turn/start")).toBe(true))
    const request = findRequest(fake, "turn/start")
    expect(request.params).toMatchObject({
      input: [
        { type: "text", text: "Explain the selected figure" },
        { type: "image", url: "data:image/png;base64,AA==" },
      ],
      approvalPolicy: "never",
    })
    fake.emitLine({ id: request.id, result: { turn: { id: "turn-image" } } })
    await expect(pending).resolves.toBe("turn-image")
  })

  it("reads the app-server web-search capability instead of inferring it from auth", async () => {
    const pending = client.readProviderCapabilities()

    await vi.waitFor(() => expect(hasRequest(fake, "model/providerCapabilities/read")).toBe(true))
    const request = findRequest(fake, "model/providerCapabilities/read")
    expect(request.params).toEqual({})
    fake.emitLine({
      id: request.id,
      result: { namespaceTools: false, imageGeneration: false, webSearch: true },
    })

    await expect(pending).resolves.toEqual({ webSearch: true })
  })

  it("streams deltas and completes turn via session with read-only sandbox", async () => {
    const session = new CodexSession(client)

    const threadPromise = session.startThread()
    await vi.waitFor(() => expect(hasRequest(fake, "thread/start")).toBe(true))

    const threadMsg = findRequest(fake, "thread/start")
    expect(threadMsg.params).toMatchObject({ sandbox: "read-only", approvalPolicy: "never" })
    expect(threadMsg.params).not.toHaveProperty("config")
    fake.emitLine({ id: threadMsg.id, result: { thread: { id: "thread-abc" } } })
    const threadId = await threadPromise
    expect(threadId).toBe("thread-abc")

    const turnPromise = session.startTurn({
      threadId,
      prompt: "Translate this passage",
      reasoningEffort: "high",
    })
    await vi.waitFor(() => expect(hasRequest(fake, "turn/start")).toBe(true))

    const turnMsg = findRequest(fake, "turn/start")
    expect(turnMsg.params).toMatchObject({
      sandboxPolicy: {
        type: "readOnly",
        access: {
          type: "restricted",
          includePlatformDefaults: false,
          readableRoots: [],
        },
        networkAccess: false,
      },
      input: [{ type: "text", text: "Translate this passage" }],
      effort: "high",
    })
    fake.emitLine({ id: turnMsg.id, result: { turn: { id: "turn-xyz" } } })
    const turnId = await turnPromise
    expect(turnId).toBe("turn-xyz")

    const deltas: string[] = []
    client.onDelta((d) => deltas.push(d.delta))

    fake.emitLine({
      method: "item/agentMessage/delta",
      params: { threadId, turnId, delta: "Hello " },
    })
    fake.emitLine({
      method: "item/agentMessage/delta",
      params: { threadId, turnId, delta: "World!" },
    })

    expect(deltas.join("")).toBe("Hello World!")

    let completedTurnId = ""
    client.onTurnCompleted((c) => {
      completedTurnId = c.turn.id
    })
    fake.emitLine({
      method: "turn/completed",
      params: { threadId, turn: { id: turnId, status: "completed" } },
    })
    expect(completedTurnId).toBe("turn-xyz")
  })
})
