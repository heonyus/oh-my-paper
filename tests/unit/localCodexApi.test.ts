import { afterEach, describe, expect, it, vi } from "vitest"
import { createLocalCodexApi } from "../../src/web/localCodexApi"

afterEach(() => vi.unstubAllGlobals())

describe("local OpenAI connection", () => {
  it("starts and cancels a login through the local server when requested", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "chatgpt",
            loginId: "test-login",
            authUrl: "https://auth.openai.com/test",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal("fetch", fetcher)
    const api = createLocalCodexApi()

    const login = await api.startLogin("chatgpt")
    await api.cancelLogin("test-login")

    expect(login.type).toBe("chatgpt")
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/rpc/codexStartLogin",
      "/api/rpc/codexCancelLogin",
    ])
  })

  it("propagates a login failure instead of marking the account connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "login_unavailable" }), { status: 503 }),
        ),
    )

    await expect(createLocalCodexApi().startLogin("chatgpt")).rejects.toThrow("login_unavailable")
  })

  it("delivers completion events and closes its connection on unsubscribe", () => {
    class TestEventSource {
      static current: TestEventSource | undefined
      onmessage: ((event: MessageEvent<string>) => void) | null = null
      close = vi.fn()
      constructor(readonly url: string) {
        TestEventSource.current = this
      }
    }
    vi.stubGlobal("EventSource", TestEventSource)
    const listener = vi.fn()

    const unsubscribe = createLocalCodexApi().onLoginCompleted(listener)
    TestEventSource.current?.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ loginId: "test-login", success: false, error: "cancelled" }),
      }),
    )
    unsubscribe()

    expect(listener).toHaveBeenCalledWith({
      loginId: "test-login",
      success: false,
      error: "cancelled",
    })
    expect(TestEventSource.current?.url).toBe("/api/events/codex-login")
    expect(TestEventSource.current?.close).toHaveBeenCalledOnce()
  })
})
