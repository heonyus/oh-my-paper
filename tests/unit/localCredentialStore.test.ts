// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { LocalCredentialStore } from "../../src/server/localCredentialStore"

const cleanup: string[] = []

afterEach(async () => {
  for (const root of cleanup.splice(0)) await rm(root, { recursive: true, force: true })
})

describe("LocalCredentialStore", () => {
  it("persists user-owned OpenRouter and Mistral credentials across restarts", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-credentials-"))
    cleanup.push(root)
    const first = await LocalCredentialStore.open(root, {
      openrouter: null,
      mistralApiKey: null,
    })

    await first.saveOpenRouter({
      provider: "openrouter",
      apiKey: "sk-or-user-owned-key-at-least-twenty-characters",
      model: "qwen/qwen3.8-flash",
    })
    await first.saveMistral("mistral-user-owned-key-at-least-twenty-characters")

    const reopened = await LocalCredentialStore.open(root, {
      openrouter: null,
      mistralApiKey: null,
    })
    expect(reopened.openRouterConfig()).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-user-owned-key-at-least-twenty-characters",
      model: "qwen/qwen3.8-flash",
    })
    expect(reopened.mistralKey()).toBe("mistral-user-owned-key-at-least-twenty-characters")
  })
})
