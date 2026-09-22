import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => {
      const decrypted = value.toString("utf8")
      if (decrypted === "unreadable") throw new Error("decrypt failed")
      return decrypted
    },
  },
}))

import { ProviderService } from "../../src/electron/providerService"

const temporaryRoots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("ProviderService saved configuration", () => {
  it("does not configure or persist inherited environment credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-provider-"))
    temporaryRoots.push(root)
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-example-key-at-least-twenty-characters")
    vi.stubEnv("OH_MY_PAPER_AI_PROVIDER", "openrouter")
    vi.stubEnv("OH_MY_PAPER_AI_MODEL", "deepseek/deepseek-v4-flash-0731")
    const service = new ProviderService(root)

    expect(await service.status()).toMatchObject({
      configured: false,
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
    })
    await expect(access(join(root, "provider-config.bin"))).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("preserves saved user configuration instead of overwriting with environment defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-provider-"))
    temporaryRoots.push(root)
    const service = new ProviderService(root)
    await service.saveConfig({
      provider: "openrouter",
      apiKey: "sk-or-stale-key-at-least-twenty-characters",
      model: "deepseek/deepseek-v4.1-flash",
    })
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-current-key-at-least-twenty-characters")

    expect(await service.status()).toMatchObject({
      configured: true,
      provider: "openrouter",
      model: "deepseek/deepseek-v4.1-flash",
    })

    vi.unstubAllEnvs()
    expect(await new ProviderService(root).status()).toMatchObject({
      configured: true,
      model: "deepseek/deepseek-v4.1-flash",
    })
  })

  it("preserves the legacy saved key when inherited credentials exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-provider-"))
    temporaryRoots.push(root)
    await writeFile(
      join(root, "openai-key.bin"),
      Buffer.from("sk-legacy-saved-key-at-least-twenty-characters"),
    )
    vi.stubEnv("OPENAI_API_KEY", "sk-inherited-key-at-least-twenty-characters")

    expect(await new ProviderService(root).status()).toEqual({
      configured: true,
      provider: "openai",
      model: "gpt-5",
    })
    expect(await readFile(join(root, "openai-key.bin"), "utf8")).toBe(
      "sk-legacy-saved-key-at-least-twenty-characters",
    )
  })

  it("does not share inherited credentials between account roots", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "ohmypaper-provider-account-a-"))
    const secondRoot = await mkdtemp(join(tmpdir(), "ohmypaper-provider-account-b-"))
    temporaryRoots.push(firstRoot, secondRoot)
    vi.stubEnv("OPENAI_API_KEY", "sk-example-key-at-least-twenty-characters")
    vi.stubEnv("OH_MY_PAPER_AI_PROVIDER", "openai")
    vi.stubEnv("OH_MY_PAPER_AI_MODEL", "gpt-5")

    const first = new ProviderService(firstRoot)
    const second = new ProviderService(secondRoot)
    expect((await first.status()).configured).toBe(false)
    expect((await second.status()).configured).toBe(false)

    await first.saveConfig({
      provider: "openai",
      apiKey: "sk-saved-account-a-key-at-least-twenty-characters",
      model: "gpt-5",
    })

    expect((await first.status()).configured).toBe(true)
    expect((await second.status()).configured).toBe(false)
    await expect(access(join(secondRoot, "provider-config.bin"))).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("produces a recovery error when encrypted configuration is corrupt rather than silently overwriting", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-provider-"))
    temporaryRoots.push(root)
    await writeFile(join(root, "provider-config.bin"), "unreadable", "utf8")
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-current-key-at-least-twenty-characters")

    await expect(new ProviderService(root).status()).rejects.toMatchObject({
      name: "ProviderConfigurationError",
      kind: "corrupt_config",
    })
  })
})
