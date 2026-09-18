// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { createCodexWebSearchPort } from "../../../src/electron/codexWebSearch"
import { WebDiscoveryError } from "../../../src/electron/webDiscovery"
import { codexAccountStatusSchema } from "../../../src/shared/codexTypes"

const status = codexAccountStatusSchema.parse({
  available: true,
  authenticated: true,
  account: { type: "chatgpt", planType: "plus" },
  requiresOpenaiAuth: true,
  rateLimits: null,
  executablePath: "/Applications/Codex",
})

function harness() {
  const readProviderCapabilities = vi.fn(async () => ({ webSearch: true }))
  const startThread = vi.fn(async () => "thread-1")
  const startTurn = vi.fn(async () => "turn-1")
  return {
    client: { readProviderCapabilities },
    startThread,
    startTurn,
  }
}

describe("Codex subscription structured web search", () => {
  it("fails closed before a turn when web search is advertised without a source adapter", async () => {
    const fake = harness()
    const port = createCodexWebSearchPort({
      getStatus: async () => status,
      client: fake.client,
    })

    const capability = await port.readCapability()
    const operation = port.runSearch({ query: "synthetic query", maxResults: 5 })

    expect(capability).toMatchObject({
      status: "unavailable",
      reason: "structured_sources_unsupported",
    })
    await expect(operation).rejects.toMatchObject({ kind: "capability_unavailable" })
    expect(fake.startThread).not.toHaveBeenCalled()
    expect(fake.startTurn).not.toHaveBeenCalled()
  })

  it("reports an old CLI without the official capability method as unavailable", async () => {
    const fake = harness()
    fake.client.readProviderCapabilities.mockRejectedValue(
      new Error("unknown method: model/providerCapabilities/read"),
    )
    const port = createCodexWebSearchPort({
      getStatus: async () => status,
      client: fake.client,
    })

    await expect(port.readCapability()).resolves.toMatchObject({
      status: "unavailable",
      reason: "protocol_unavailable",
    })
    expect(fake.startTurn).not.toHaveBeenCalled()
  })

  it("fails before a turn for unauthenticated or exhausted accounts", async () => {
    const unauthenticated = harness()
    const unauthenticatedPort = createCodexWebSearchPort({
      getStatus: async () => ({ ...status, authenticated: false, account: null }),
      client: unauthenticated.client,
    })
    await expect(
      unauthenticatedPort.runSearch({ query: "synthetic query", maxResults: 5 }),
    ).rejects.toBeInstanceOf(WebDiscoveryError)
    expect(unauthenticated.startTurn).not.toHaveBeenCalled()

    const exhausted = harness()
    const exhaustedPort = createCodexWebSearchPort({
      getStatus: async () => ({
        ...status,
        rateLimits: { rateLimits: { primary: { usedPercent: 100 } } },
      }),
      client: exhausted.client,
    })
    await expect(
      exhaustedPort.runSearch({ query: "synthetic query", maxResults: 5 }),
    ).rejects.toMatchObject({ kind: "quota" })
    expect(exhausted.startTurn).not.toHaveBeenCalled()
  })

  it("validates the direct-port query and result boundary before probing", async () => {
    const fake = harness()
    const port = createCodexWebSearchPort({
      getStatus: async () => status,
      client: fake.client,
    })

    await expect(port.runSearch({ query: "", maxResults: 5 })).rejects.toThrow()
    await expect(port.runSearch({ query: "synthetic query", maxResults: 21 })).rejects.toThrow()
    expect(fake.client.readProviderCapabilities).not.toHaveBeenCalled()
  })
})
